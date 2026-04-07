import { test, expect } from '@playwright/test';

const PROD_URL = process.env.BASE_URL || 'https://astercopilot.com';

// Helper: skip onboarding if it appears, get to the main app
async function ensureInApp(page) {
  await page.goto(PROD_URL);
  await page.waitForLoadState('networkidle');
  const onboarding = await page.getByText('Skip onboarding').isVisible().catch(() => false);
  if (onboarding) {
    await page.getByText('Skip onboarding').click();
    await page.waitForTimeout(500);
  }
}

test.describe('Production Checklist', () => {

  // ── Dashboard ─────────────────────────────────────────────────────────
  test('1. Dashboard loads with correct stat cards', { tag: '@smoke' }, async ({ page }) => {
    await ensureInApp(page);
    await expect(page.getByText('Tracked')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Applied')).toBeVisible();
    await expect(page.getByText('Active Pipeline')).toBeVisible();
    await expect(page.getByText('Screen Rate')).toBeVisible();
  });

  test('2. Health indicator or contextual ping renders', { tag: '@smoke' }, async ({ page }) => {
    await ensureInApp(page);
    // Should see either health state (STUCK/SLOW/ACTIVE/STRONG) or a contextual ping
    const hasHealth = await page.getByText(/STUCK|SLOW|ACTIVE|STRONG/).isVisible().catch(() => false);
    const hasPing = await page.getByText(/Go to Pipeline|Analyze & Apply|Review Strategy/).isVisible().catch(() => false);
    expect(hasHealth || hasPing).toBe(true);
  });

  test('3. Today\'s Actions section loads', { tag: '@smoke' }, async ({ page }) => {
    await ensureInApp(page);
    await expect(page.getByText("Today's Actions")).toBeVisible({ timeout: 10000 });
  });

  // ── Analyze ───────────────────────────────────────────────────────────
  test('4. Analyze tab loads with JD textarea', { tag: '@smoke' }, async ({ page }) => {
    await ensureInApp(page);
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect(page.getByText('Analyze a job')).toBeVisible();
    await expect(page.locator('textarea').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Analyze with Aster/i })).toBeVisible();
  });

  test('5. Analyze — paste JD and get results', { tag: '@smoke' }, async ({ page }) => {
    test.setTimeout(60000);
    await ensureInApp(page);
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    const jd = 'Senior Product Manager at a Series B healthcare AI company. 5+ years PM experience required. Build and ship AI-powered clinical workflow tools. Must have experience with B2B SaaS, cross-functional leadership, and data-driven product strategy. Remote friendly. Competitive compensation and equity.';
    await page.locator('textarea').first().fill(jd);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('HealthAI Co');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Sr PM');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    // Wait for real Claude response — may take 10-30 seconds
    // Wait for the fit score ring to appear — this confirms analysis completed
    await expect(page.locator('.score-ring').first()).toBeVisible({ timeout: 45000 });
    // Verify key sections rendered
    await expect(page.getByText('Strengths')).toBeVisible();
    await expect(page.getByText('Gaps to Address')).toBeVisible();
    // NOTE: This creates a real analysis but we do NOT save it to pipeline (read-only test)
  });

  // ── Pipeline ──────────────────────────────────────────────────────────
  test('6. Pipeline tab loads with filter tabs', { tag: '@smoke' }, async ({ page }) => {
    await ensureInApp(page);
    await page.getByRole('button', { name: 'Pipeline', exact: true }).click();
    await expect(page.getByText('Your Pipeline')).toBeVisible();
    // Filter pills should include at least "All"
    await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible();
  });

  test('7. Pipeline Export CSV button exists', { tag: '@smoke' }, async ({ page }) => {
    await ensureInApp(page);
    await page.getByRole('button', { name: 'Pipeline', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
  });

  // ── Outreach ──────────────────────────────────────────────────────────
  test('8. Outreach tab loads', { tag: '@smoke' }, async ({ page }) => {
    await ensureInApp(page);
    await page.getByRole('button', { name: 'Outreach', exact: true }).click();
    // Should show the outreach view — either job sidebar or "Select a job" prompt
    const hasOutreach = await page.getByText('Select Job').isVisible().catch(() => false) ||
      await page.getByText('Select a job to start outreach').isVisible().catch(() => false) ||
      await page.getByRole('button', { name: 'Get Strategy' }).isVisible().catch(() => false);
    expect(hasOutreach).toBe(true);
  });

  // ── Strategy ──────────────────────────────────────────────────────────
  test('9. Strategy tab loads', { tag: '@smoke' }, async ({ page }) => {
    await ensureInApp(page);
    await page.getByRole('button', { name: 'Strategy', exact: true }).click();
    await expect(page.getByText('Job Search Strategy')).toBeVisible();
    await expect(page.locator('input[placeholder*="Senior role"]')).toBeVisible();
  });

  // ── Resume ────────────────────────────────────────────────────────────
  test('10. Resume tab shows empty state for fresh user', { tag: '@smoke' }, async ({ page }) => {
    await ensureInApp(page);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    // Either shows the workshop with "Analyze My Resume" or empty state
    const hasWorkshop = await page.getByText('Resume Workshop').isVisible().catch(() => false) ||
      await page.getByText('Upload your resume first').isVisible().catch(() => false) ||
      await page.getByRole('button', { name: 'Analyze My Resume' }).isVisible().catch(() => false);
    expect(hasWorkshop).toBe(true);
  });

  // ── Preferences ───────────────────────────────────────────────────────
  test('11. Prefs modal opens and closes', { tag: '@smoke' }, async ({ page }) => {
    await ensureInApp(page);
    await page.locator('button', { hasText: 'Prefs' }).first().click();
    await expect(page.getByText('Job Search Preferences')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Job Search Preferences')).not.toBeVisible();
  });

  // ── Mobile ────────────────────────────────────────────────────────────
  test('12. Mobile nav — hamburger menu at 390x844', { tag: '@smoke' }, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ensureInApp(page);
    // Hamburger should be visible
    const hamburger = page.locator('.nav-hamburger');
    await expect(hamburger).toBeVisible();
    // Open menu
    await hamburger.click();
    await expect(page.locator('.nav-mobile-dropdown')).toBeVisible();
    // Nav items in dropdown
    await expect(page.locator('.nav-mobile-dropdown').getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(page.locator('.nav-mobile-dropdown').getByRole('button', { name: 'Pipeline', exact: true })).toBeVisible();
    // Close
    await hamburger.click();
    await expect(page.locator('.nav-mobile-dropdown')).not.toBeVisible();
  });

  // ── Navigation ────────────────────────────────────────────────────────
  test('13. All nav tabs are clickable', { tag: '@smoke' }, async ({ page }) => {
    await ensureInApp(page);
    const tabs = ['Dashboard', 'Analyze', 'Pipeline', 'Outreach', 'Strategy', 'Resume'];
    for (const tab of tabs) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(300);
    }
    // If we got here without crash, all tabs are functional
    expect(true).toBe(true);
  });

  // ── No console errors ─────────────────────────────────────────────────
  test('14. No console errors during navigation', { tag: '@smoke' }, async ({ page }) => {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await ensureInApp(page);
    // Navigate through all views
    for (const tab of ['Analyze', 'Pipeline', 'Outreach', 'Strategy', 'Resume', 'Dashboard']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(200);
    }
    const realErrors = errors.filter(e => !e.includes('favicon') && !e.includes('the server responded with a status of'));
    expect(realErrors).toHaveLength(0);
  });
});
