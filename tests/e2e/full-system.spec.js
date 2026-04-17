import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';

const SAMPLE_JD = `Senior Software Engineer at Acme Corp. 5+ years experience required. Build scalable APIs and distributed systems. Python, Go, AWS. Competitive compensation $140k-180k, equity, remote work, unlimited PTO, 401k.`;

async function dismissAuth(page) {
  const v = await page.getByText('Continue without account').isVisible({ timeout: 2000 }).catch(() => false);
  if (v) await page.getByText('Continue without account').click();
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIRST VISIT
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('First visit (clean state)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
  });

  test('page loads, hero visible, no errors', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await navigateTo(page, 'analyze');
    await expect(page.getByText('Stop guessing')).toBeVisible();
    await expect(page.getByText('No sign-up required. Free.')).toBeVisible();
    expect(errors.filter(e => !e.includes('favicon') && !e.includes('the server responded'))).toHaveLength(0);
  });

  test('email capture visible', async ({ page }) => {
    await navigateTo(page, 'analyze');
    await expect(page.getByText('Want updates')).toBeVisible();
  });

  test('sample JD link visible', async ({ page }) => {
    await navigateTo(page, 'analyze');
    await expect(page.getByText('Try a sample JD')).toBeVisible();
  });

  test('all nav tabs clickable without crash', async ({ page }) => {
    for (const tab of ['Dashboard', 'Analyze', 'Pipeline', 'Outreach', 'Strategy', 'Resume']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(200);
    }
    expect(true).toBe(true);
  });

  test('footer links present', async ({ page }) => {
    await expect(page.locator('a[href="/privacy"]')).toBeVisible();
    await expect(page.locator('a[href="mailto:zubair@astercopilot.com"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete my workspace' })).toBeVisible();
  });

  test('OG meta tags present', async ({ page }) => {
    expect(await page.locator('meta[property="og:title"]').getAttribute('content')).toContain('Aster');
    expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toContain('og-image.png');
    expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe('summary_large_image');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESUME DOT (isolated — no beforeEach that loads a resume)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Resume indicator', () => {
  test('no resume dot when no resume', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-resume');
    const btn = page.getByRole('button', { name: 'Resume', exact: true });
    const dots = btn.locator('span[style*="border-radius: 50%"]');
    await expect(dots).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CORE ANALYZE FLOW
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Core analyze flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
  });

  test('paste JD → analyze → result appears with score', async ({ page }) => {
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('Acme');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('SWE');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.locator('.score-ring').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Strengths')).toBeVisible();
  });

  test('share buttons appear after analysis', async ({ page }) => {
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('Acme');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('SWE');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.locator('.score-ring').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Copy shareable summary')).toBeVisible();
    await expect(page.getByText('Share on LinkedIn')).toBeVisible();
  });

  test('feedback thumbs appear after analysis', async ({ page }) => {
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('Co');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('E');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.locator('.score-ring').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Was this helpful?')).toBeVisible();
  });

  test('empty textarea → analyze button disabled', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Analyze with Aster/i })).toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SAMPLE JD
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Sample JD flow', () => {
  test('click sample → populates textarea', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.getByText('Try a sample JD').click();
    const val = await page.locator('textarea').first().inputValue();
    expect(val).toContain('Relay');
    await expect(page.getByText('Try a sample JD')).not.toBeVisible();
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

  test('blocked domain shows error card', async ({ page }) => {
    await page.route('**/api/scrape', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'dynamic_site', message: 'Lever blocks automated access.' }),
    }));
    await page.getByText('Have a link?').click();
    await page.locator('input[placeholder*="greenhouse"]').fill('https://jobs.lever.co/company/123');
    await page.getByRole('button', { name: 'Extract' }).click();
    await expect(page.getByText('Lever blocks')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Paste the description instead' })).toBeVisible();
  });

  test('paste-instead button switches to textarea', async ({ page }) => {
    await page.route('**/api/scrape', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'fetch_failed', message: 'Timeout' }),
    }));
    await page.getByText('Have a link?').click();
    await page.locator('input[placeholder*="greenhouse"]').fill('https://example.com/slow');
    await page.getByRole('button', { name: 'Extract' }).click();
    await expect(page.getByRole('button', { name: 'Paste the description instead' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Paste the description instead' }).click();
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
// SAVE FLOW & AUTH
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Save flow', () => {
  test('save triggers auth modal for unsigned users', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
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

  test('dismiss auth modal saves locally', async ({ page }) => {
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
// PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Pipeline', () => {
  test('saved jobs appear and can be viewed', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'with-5-jobs');
    await navigateTo(page, 'pipeline');
    // Should see job entries
    await expect(page.locator('.card').first()).toBeVisible({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEEDBACK WIDGET
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
// ERROR RESILIENCE
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Error resilience', () => {
  test('Claude 500 → user sees error, textarea preserved', async ({ page }) => {
    await page.route('**/api/claude', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"fail"}' }));
    await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/parse-resume', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"text":"r"}' }));
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill('My important JD text');
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('Err');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('E');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText(/failed|Could not|timed out|500/i)).toBeVisible({ timeout: 10000 });
    // Textarea preserved
    await expect(page.locator('textarea').first()).toHaveValue('My important JD text');
    // Button re-enables
    await expect(page.getByRole('button', { name: /Analyze with Aster/i })).toBeEnabled({ timeout: 5000 });
  });

  test('Claude 429 → user sees rate limit message', async ({ page }) => {
    await page.route('**/api/claude', route => route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"Rate limited. Try again in a minute."}' }));
    await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('Co');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('E');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText(/Too many requests|Rate limited/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('Claude malformed JSON → error with retry', async ({ page }) => {
    await page.route('**/api/claude', (route, req) => {
      const body = JSON.parse(req.postData());
      if (body.messages?.[0]?.content?.includes('Extract the company')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '{}' }] }) });
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: 'broken json {{{' }] }) });
      }
    });
    await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('Malformed');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('E');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText(/Could not parse/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Analyze with Aster/i })).toBeEnabled({ timeout: 3000 });
  });

  test('full navigation produces zero console errors', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    for (const tab of ['Analyze', 'Pipeline', 'Outreach', 'Strategy', 'Resume', 'Dashboard']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(300);
    }
    const realErrors = errors.filter(e => !e.includes('favicon') && !e.includes('the server responded'));
    expect(realErrors).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Persistence', () => {
  test('saved job survives refresh', async ({ page }) => {
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
    // Poll until React effect flushes the job to localStorage
    await page.waitForFunction(() => {
      try { return JSON.parse(localStorage.getItem('aster_jobs') || '[]').some(j => j.company === 'PersistCo'); }
      catch { return false; }
    }, { timeout: 5000 });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await navigateTo(page, 'pipeline');
    await expect(page.getByText('PersistCo')).toBeVisible({ timeout: 10000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE (375px)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Mobile viewport (375px)', () => {
  test('layout works, navigation accessible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await expect(page.locator('.nav-hamburger')).toBeVisible();
    // Feedback button visible
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
// TABLET (768px)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Tablet viewport (768px)', () => {
  test('layout correct at breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    // At 768px, nav links are hidden (breakpoint 900px) — use hamburger menu
    await page.locator('.nav-hamburger').click();
    await page.locator('.nav-mobile-dropdown').getByRole('button', { name: 'Analyze', exact: true }).click();
    await page.waitForTimeout(300);
    await expect(page.getByText('Analyze a job')).toBeVisible();
    // Textarea is visible and usable
    await page.locator('textarea').first().fill('Tablet test');
    await expect(page.locator('textarea').first()).toHaveValue('Tablet test');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DATA PRESERVATION ON ERROR
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Data preservation on error', () => {
  test('textarea content and inputs preserved after analysis error', async ({ page }) => {
    await page.route('**/api/claude', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"fail"}' }));
    await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill('My important JD text');
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('Kept');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Data');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText(/failed|Could not|500/i)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('textarea').first()).toHaveValue('My important JD text');
    await expect(page.locator('input[placeholder="e.g. Acme Corp"]')).toHaveValue('Kept');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OG META TAGS (dedicated)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('OG meta tags', () => {
  test('og-image.png returns 200 PNG', async ({ request }) => {
    const r = await request.get('/og-image.png');
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('image/png');
  });
});
