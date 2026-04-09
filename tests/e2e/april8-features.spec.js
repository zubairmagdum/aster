import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';

const SAMPLE_JD = `Senior Software Engineer at Acme Corp. 5+ years experience required in Python or Go, AWS, distributed systems. Build scalable APIs serving millions of users. Competitive compensation, equity, remote work, unlimited PTO, 401k match.`;

async function dismissAuthIfNeeded(page) {
  const v = await page.getByText('Continue without account').isVisible({ timeout: 2000 }).catch(() => false);
  if (v) await page.getByText('Continue without account').click();
}

// ─────────────────────────────────────────────────────────────────────────────
// OG META TAGS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('OG Meta Tags', () => {
  test('page has correct OG and Twitter meta tags', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(ogTitle).toContain('Aster');
    const ogDesc = await page.locator('meta[property="og:description"]').getAttribute('content');
    expect(ogDesc).toContain('job description');
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImage).toContain('og-image.png');
    const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
    expect(ogUrl).toContain('astercopilot.com');
    const twCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
    expect(twCard).toBe('summary_large_image');
  });

  test('og-image.png returns 200', async ({ request }) => {
    const response = await request.get('/og-image.png');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HERO EXPLAINER
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Hero Explainer', () => {
  test('hero visible on first visit with no jobs', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await expect(page.getByText('Stop guessing')).toBeVisible();
    await expect(page.getByText('No sign-up required. Free.')).toBeVisible();
  });

  test('hero is NOT visible after analysis is performed', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('TestCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Eng');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText('Apply with Tailoring')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Stop guessing')).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE JD BUTTON
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Sample JD Button', () => {
  test('sample link visible when textarea is empty, populates on click', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    const sampleBtn = page.getByText('Try a sample JD');
    await expect(sampleBtn).toBeVisible();
    await sampleBtn.click();
    const textarea = page.locator('textarea').first();
    const val = await textarea.inputValue();
    expect(val).toContain('Relay');
    expect(val).toContain('Responsibilities');
    expect(val).toContain('Requirements');
  });

  test('sample link hidden when textarea has content', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill('Some text');
    await expect(page.getByText('Try a sample JD')).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// URL SCRAPING UI
// ─────────────────────────────────────────────────────────────────────────────
test.describe('URL Scraping UI', () => {
  test('toggle shows URL input and helper text', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.getByText('Have a link?').click();
    await expect(page.locator('input[placeholder*="greenhouse"]')).toBeVisible();
    await expect(page.getByText('Works best with Greenhouse')).toBeVisible();
  });

  test('switching back shows textarea', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.getByText('Have a link?').click();
    await expect(page.locator('input[placeholder*="greenhouse"]')).toBeVisible();
    await page.getByText('Paste the full description instead').click();
    await expect(page.locator('textarea').first()).toBeVisible();
  });

  test('extract button disabled when URL is empty', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.getByText('Have a link?').click();
    await expect(page.getByRole('button', { name: 'Extract' })).toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL CAPTURE
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Email Capture', () => {
  test('email input and digest checkbox visible for first-time visitors', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await expect(page.getByText('Want updates on new features?')).toBeVisible();
    await expect(page.getByText('Get weekly job search insights')).toBeVisible();
  });

  test('submitting valid email shows confirmation', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('input[placeholder="you@email.com"]').last().fill('test@example.com');
    await page.getByRole('button', { name: 'Subscribe' }).click();
    await expect(page.getByText("You're in!")).toBeVisible();
  });

  test('submitting invalid email does not submit', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('input[placeholder="you@email.com"]').last().fill('notanemail');
    await page.getByRole('button', { name: 'Subscribe' }).click();
    await expect(page.getByText("You're in!")).not.toBeVisible();
    await expect(page.getByText('Want updates')).toBeVisible();
  });

  test('email capture NOT visible after user has analyzed a JD', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'with-5-jobs');
    await navigateTo(page, 'analyze');
    await expect(page.getByText('Want updates on new features?')).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SHARE CTA
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Share CTA', () => {
  test('share buttons visible after analysis, not before', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await expect(page.getByText('Copy shareable summary')).not.toBeVisible();
    await expect(page.getByText('Share on LinkedIn')).not.toBeVisible();
    // Run analysis
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('ShareCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Eng');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText('Apply with Tailoring')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Copy shareable summary')).toBeVisible();
    await expect(page.getByText('Share on LinkedIn')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FEEDBACK WIDGET MOBILE POSITIONING
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Feedback Widget Mobile', () => {
  test('feedback button positioned above CTA at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    const feedbackBtn = page.locator('.feedback-btn');
    await expect(feedbackBtn).toBeVisible();
    const box = await feedbackBtn.boundingBox();
    // At mobile, bottom should be >= 80px (pushed up from default 24px)
    expect(box.y + box.height).toBeLessThan(812 - 70); // button top should be above the 80px zone
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RESUME NAV DOT
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Resume Nav Dot', () => {
  test('no dot shown when no resume uploaded', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-resume');
    // The resume nav button should NOT have a colored dot span
    const resumeBtn = page.getByRole('button', { name: 'Resume', exact: true });
    await expect(resumeBtn).toBeVisible();
    // Check there's no 6px dot inside the button
    const dots = resumeBtn.locator('span[style*="border-radius: 50%"]');
    await expect(dots).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FOOTER LINKS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Footer Links', () => {
  test('privacy and contact links in footer', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await expect(page.locator('a[href="/privacy"]')).toBeVisible();
    await expect(page.locator('a[href="mailto:zubair@astercopilot.com"]')).toBeVisible();
  });
});
