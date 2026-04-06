import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';

// Known issues to address separately: color-contrast (design tokens), document-title (layout)
const KNOWN_ISSUES = ['color-contrast', 'document-title'];

function assertNoViolations(results) {
  const violations = results.violations
    .filter(v => ['critical', 'serious'].includes(v.impact))
    .filter(v => !KNOWN_ISSUES.includes(v.id));
  const messages = violations.map(v => `${v.impact}: ${v.id} - ${v.description} (${v.nodes.length} nodes)`);
  expect(violations, `Accessibility violations:\n${messages.join('\n')}`).toHaveLength(0);

  // Log known issues as warnings (informational, not blocking)
  const known = results.violations.filter(v => KNOWN_ISSUES.includes(v.id));
  if (known.length > 0) {
    console.log(`  ⚠ Known a11y issues (not blocking): ${known.map(v => `${v.id} (${v.nodes.length} nodes)`).join(', ')}`);
  }
}

test.describe('Accessibility Audit', () => {
  test('Dashboard has no critical accessibility violations', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'dashboard');
    await expect(page.getByText("Today's Actions")).toBeVisible({ timeout: 10000 });
    const results = await new AxeBuilder({ page }).analyze();
    assertNoViolations(results);
  });

  test('Analyze view has no critical violations', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await expect(page.getByText('Analyze a job')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    assertNoViolations(results);
  });

  test('Pipeline view has no critical violations', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'with-5-jobs');
    await navigateTo(page, 'pipeline');
    await expect(page.getByText('Your Pipeline')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Stripe').first()).toBeVisible({ timeout: 5000 });
    const results = await new AxeBuilder({ page }).analyze();
    assertNoViolations(results);
  });

  test('Preferences modal has no critical violations', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await page.locator('button', { hasText: 'Prefs' }).first().click();
    await expect(page.getByText('Job Search Preferences')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    assertNoViolations(results);
  });

  test('Onboarding has no critical violations', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'empty');
    await expect(page.getByText('Land the job')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    assertNoViolations(results);
  });
});
