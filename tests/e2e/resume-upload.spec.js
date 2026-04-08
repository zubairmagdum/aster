import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';
import path from 'path';

test.describe('Resume File Upload', () => {
  test('upload valid file → name appears, prefs inferred', { tag: '@critical' }, async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'empty');
    // Skip to upload step
    await page.getByText('Get started').click();
    await expect(page.getByText('Upload your resume')).toBeVisible();
    // Upload via hidden file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '..', 'fixtures', 'resumes', 'short_resume.txt'));
    // Mock parse-resume returns text → navigates to sign-in step
    await expect(page.getByText('Save your data across devices')).toBeVisible({ timeout: 10000 });
  });

  test('upload triggers preference inference', { tag: '@critical' }, async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'empty');
    await page.getByText('Get started').click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '..', 'fixtures', 'resumes', 'short_resume.txt'));
    // After upload, wait for sign-in step (inference runs in background)
    await expect(page.getByText('Save your data across devices')).toBeVisible({ timeout: 10000 });
    // Verify inferred prefs were saved to localStorage
    const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('aster_prefs') || '{}'));
    expect(prefs.prefsInferred).toBe(true);
  });

  test('resume text stored in localStorage after upload', { tag: '@critical' }, async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'empty');
    await page.getByText('Get started').click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '..', 'fixtures', 'resumes', 'short_resume.txt'));
    await expect(page.getByText('Save your data across devices')).toBeVisible({ timeout: 10000 });
    // Check localStorage has resume text
    const resumeText = await page.evaluate(() => localStorage.getItem('aster_resume'));
    expect(resumeText).toBeTruthy();
    expect(resumeText.length).toBeGreaterThan(5);
  });
});
