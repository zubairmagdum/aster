import { test, expect } from '@playwright/test';

const PROD_URL = process.env.BASE_URL || 'https://astercopilot.com';

test.describe('Production Smoke', () => {
  test('site loads successfully', async ({ page }) => {
    const response = await page.goto(PROD_URL);
    expect(response.status()).toBe(200);
  });

  test('app renders without console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(PROD_URL);
    await page.waitForLoadState('networkidle');
    // Filter out known benign errors (e.g. favicon 404)
    const realErrors = errors.filter(e => !e.includes('favicon'));
    expect(realErrors).toHaveLength(0);
  });

  test('navigation tabs are present', async ({ page }) => {
    await page.goto(PROD_URL);
    // Either we see the onboarding or the app nav
    const hasNav = await page.getByRole('button', { name: 'Dashboard' }).isVisible().catch(() => false);
    const hasOnboarding = await page.getByText('Land the job').isVisible().catch(() => false);
    expect(hasNav || hasOnboarding).toBe(true);
  });

  test('no broken resources', async ({ page }) => {
    const failedRequests = [];
    page.on('requestfailed', req => failedRequests.push({ url: req.url(), error: req.failure()?.errorText }));
    await page.goto(PROD_URL);
    await page.waitForLoadState('networkidle');
    // Filter out expected failures (e.g. analytics, third-party)
    const appFailures = failedRequests.filter(r => r.url.includes('astercopilot.com') || r.url.includes('localhost'));
    expect(appFailures).toHaveLength(0);
  });
});
