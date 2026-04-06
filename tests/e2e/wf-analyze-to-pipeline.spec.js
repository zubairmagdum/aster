import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';

const SAMPLE_JD = `We are looking for a Senior Software Engineer to join our platform team. You will design and build scalable APIs, work with distributed systems, and collaborate with product managers to ship features that serve millions of users. Requirements: 5+ years of software engineering experience, strong knowledge of Python or Go, experience with cloud infrastructure (AWS/GCP), familiarity with CI/CD pipelines. Nice to have: experience with Kubernetes, observability tools, API gateway design. We offer competitive compensation, equity, remote work, and unlimited PTO.`;

test.describe('W2: Analyze JD → Save to Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
  });

  test('analyze button disabled when textarea empty', { tag: '@critical' }, async ({ page }) => {
    const btn = page.getByRole('button', { name: /Analyze with Aster/i });
    await expect(btn).toBeDisabled();
  });

  test('paste JD → analyze → save to pipeline → dashboard updates', { tag: '@critical' }, async ({ page }) => {
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('Acme Corp');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Senior Engineer');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText('Apply with Tailoring')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('78')).toBeVisible();
    // Tabs
    await page.getByRole('button', { name: 'ATS Keywords' }).click();
    await expect(page.getByText('monitoring')).toBeVisible();
    await page.getByRole('button', { name: 'Resume Tailoring' }).click();
    await expect(page.getByText('Tailored Summary')).toBeVisible();
    // Save
    await page.getByRole('button', { name: 'Applied', exact: true }).click();
    await page.getByRole('button', { name: /Save to pipeline/i }).click();
    await expect(page.getByText(/Acme Corp saved/)).toBeVisible();
    // Pipeline
    await navigateTo(page, 'pipeline');
    await expect(page.getByText('Acme Corp').first()).toBeVisible();
    // Dashboard
    await navigateTo(page, 'dashboard');
    await expect(page.getByText('1').first()).toBeVisible();
  });

  test('persistence after refresh', { tag: '@critical' }, async ({ page }) => {
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('Acme Corp');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Senior Engineer');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText('Apply with Tailoring')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Applied', exact: true }).click();
    await page.getByRole('button', { name: /Save to pipeline/i }).click();
    await expect(page.getByText(/Acme Corp saved/)).toBeVisible();
    await page.reload();
    await page.waitForLoadState('networkidle');
    await navigateTo(page, 'pipeline');
    await expect(page.getByText('Acme Corp')).toBeVisible();
  });
});

test.describe('W3: Hard Skip Detection', () => {
  test('hard skip warning for excluded domain, override works', { tag: '@critical' }, async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    const gamingJD = 'We are a video game studio building next-generation esports platform experiences. Join our team to design game mechanics and virtual economies for our flagship title. We need someone with 5 years of experience.';
    await page.locator('textarea').first().fill(gamingJD);
    await expect(page.getByText('Hard Skip Detected')).toBeVisible();
    await expect(page.getByText('Domain excluded: Gaming')).toBeVisible();
    await expect(page.getByText('You can still analyze')).toBeVisible();
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('GameCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Game Designer');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText('Apply with Tailoring')).toBeVisible({ timeout: 10000 });
  });
});
