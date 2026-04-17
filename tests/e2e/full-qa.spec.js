import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';

const SAMPLE_JD = `Senior Software Engineer at Acme Corp. 5+ years experience. Build scalable APIs. Python, Go, AWS. Competitive compensation, equity, remote work, unlimited PTO, 401k.`;

async function dismissAuth(page) {
  const v = await page.getByText('Continue without account').isVisible({ timeout: 2000 }).catch(() => false);
  if (v) await page.getByText('Continue without account').click();
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIRST VISIT
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('First visit experience', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
  });

  test('app loads, nav visible, no errors', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    for (const tab of ['Dashboard', 'Analyze', 'Pipeline', 'Outreach', 'Strategy', 'Resume']) {
      await expect(page.getByRole('button', { name: tab, exact: true })).toBeVisible();
    }
    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('hero visible on analyze tab', async ({ page }) => {
    await navigateTo(page, 'analyze');
    await expect(page.getByText('Stop guessing')).toBeVisible();
    await expect(page.getByText('No sign-up required. Free.')).toBeVisible();
  });

  test('email capture visible', async ({ page }) => {
    await navigateTo(page, 'analyze');
    await expect(page.getByText('Want updates')).toBeVisible();
  });

  test('sample JD link visible', async ({ page }) => {
    await navigateTo(page, 'analyze');
    await expect(page.getByText('Try a sample JD')).toBeVisible();
  });

  test('resume dot NOT visible when no resume', async ({ page }) => {
    await setupStorage(page, 'onboarded-no-resume');
    const btn = page.getByRole('button', { name: 'Resume', exact: true });
    const dots = btn.locator('span[style*="border-radius: 50%"]');
    await expect(dots).toHaveCount(0);
  });

  test('footer links present', async ({ page }) => {
    await expect(page.locator('a[href="/privacy"]')).toBeVisible();
    await expect(page.locator('a[href="mailto:zubair@astercopilot.com"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete my workspace' })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SAMPLE JD FLOW
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Sample JD flow', () => {
  test('click sample → analyze → results render', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.getByText('Try a sample JD').click();
    const val = await page.locator('textarea').first().inputValue();
    expect(val).toContain('Relay');
    expect(val).toContain('Responsibilities');
    await expect(page.getByText('Try a sample JD')).not.toBeVisible();
    // Auto-extract fires, fill remaining fields
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.locator('.score-ring').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Strengths')).toBeVisible();
    await expect(page.getByText('Was this helpful?')).toBeVisible();
    await expect(page.getByText('Copy shareable summary')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// URL SCRAPING UI
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('URL scraping UI', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
  });

  test('toggle shows URL input with helper', async ({ page }) => {
    await page.getByText('Have a link?').click();
    await expect(page.locator('input[placeholder*="greenhouse"]')).toBeVisible();
    await expect(page.getByText('Works best with Greenhouse')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Extract' })).toBeDisabled();
  });

  test('toggle back to textarea', async ({ page }) => {
    await page.getByText('Have a link?').click();
    await page.getByText('Paste the full description instead').click();
    await expect(page.locator('textarea').first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL CAPTURE
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Email capture', () => {
  test('submit valid email → confirmation', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('input[placeholder="you@email.com"]').last().fill('test@test.com');
    await page.getByRole('button', { name: 'Subscribe' }).click();
    await expect(page.getByText("You're in!")).toBeVisible();
  });

  test('invalid email does not submit', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('input[placeholder="you@email.com"]').last().fill('nope');
    await page.getByRole('button', { name: 'Subscribe' }).click();
    await expect(page.getByText("You're in!")).not.toBeVisible();
  });

  test('not visible when user has jobs', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'with-5-jobs');
    await navigateTo(page, 'analyze');
    await expect(page.getByText('Want updates')).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SHARE CTA
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Share CTA', () => {
  test('buttons appear after analysis only', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await expect(page.getByText('Copy shareable summary')).not.toBeVisible();
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('Acme');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Eng');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.locator('.score-ring').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Copy shareable summary')).toBeVisible();
    await expect(page.getByText('Share on LinkedIn')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH FLOW
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Auth flow', () => {
  test('sign in button visible, save triggers auth modal', { timeout: 60000 }, async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await expect(page.locator('button', { hasText: 'Sign in' })).toBeVisible();
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('AuthCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Eng');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.locator('.score-ring').first()).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Save to pipeline/i }).click();
    await expect(page.getByText('Save your pipeline')).toBeVisible();
    await expect(page.getByText('Continue with Google')).toBeVisible();
  });

  test('dismiss auth modal saves locally', { timeout: 60000 }, async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('LocalCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Eng');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.locator('.score-ring').first()).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Save to pipeline/i }).click();
    await dismissAuth(page);
    await expect(page.getByText(/saved locally/i).first()).toBeVisible({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEEDBACK
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Feedback widget', () => {
  test('opens, accepts input, submits', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await page.getByRole('button', { name: /Feedback/ }).click();
    await expect(page.getByText('Share feedback')).toBeVisible();
    await page.locator('textarea[placeholder*="mind"]').fill('Great product!');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Thanks for your feedback')).toBeVisible();
  });

  test('empty feedback prevented', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await page.getByRole('button', { name: /Feedback/ }).click();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSIS FEEDBACK (thumbs)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Analysis thumbs feedback', () => {
  test('appears after analysis, can vote once', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('Co');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('E');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.locator('.score-ring').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Was this helpful?')).toBeVisible();
    await page.getByText('👍').click();
    await expect(page.getByText('Thanks for the feedback')).toBeVisible();
    await expect(page.getByText('👍')).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OG META TAGS
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('OG meta tags', () => {
  test('all OG and Twitter tags present', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    expect(await page.locator('meta[property="og:title"]').getAttribute('content')).toContain('Aster');
    expect(await page.locator('meta[property="og:description"]').getAttribute('content')).toBeTruthy();
    expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toContain('og-image.png');
    expect(await page.locator('meta[property="og:url"]').getAttribute('content')).toContain('astercopilot.com');
    expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe('summary_large_image');
  });

  test('og-image.png returns 200 PNG', async ({ request }) => {
    const r = await request.get('/og-image.png');
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('image/png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE (375px)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Mobile viewport (375px)', () => {
  test('layout works, feedback positioned correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    // Hamburger visible
    await expect(page.locator('.nav-hamburger')).toBeVisible();
    // Feedback button visible and positioned high
    const fb = page.locator('.feedback-btn');
    await expect(fb).toBeVisible();
    const box = await fb.boundingBox();
    expect(box.y + box.height).toBeLessThan(812 - 60);
    // Navigate via hamburger
    await page.locator('.nav-hamburger').click();
    await page.locator('.nav-mobile-dropdown').getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect(page.getByText('Analyze a job')).toBeVisible();
    // Textarea usable
    await page.locator('textarea').first().fill('Test mobile');
    await expect(page.locator('textarea').first()).toHaveValue('Test mobile');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Navigation', () => {
  test('all tabs clickable without crash', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    for (const tab of ['Dashboard', 'Analyze', 'Pipeline', 'Outreach', 'Strategy', 'Resume']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(200);
    }
    // If we got here, no crashes
    expect(true).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Persistence', () => {
  test('saved job survives refresh', { timeout: 60000 }, async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('PersistCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Eng');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.locator('.score-ring').first()).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Save to pipeline/i }).click();
    await dismissAuth(page);
    await expect(page.getByText(/saved/i).first()).toBeVisible({ timeout: 5000 });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await navigateTo(page, 'pipeline');
    await expect(page.getByText('PersistCo')).toBeVisible({ timeout: 10000 });
  });
});
