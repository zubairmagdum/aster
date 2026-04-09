import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';

const SAMPLE_JD = `Senior Software Engineer at Acme Corp. 5+ years experience required. Build scalable APIs and distributed systems. Python, Go, AWS. Competitive compensation, equity, remote work, unlimited PTO.`;

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSIS ERRORS
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Analysis error handling', () => {
  test('Claude 500 → user sees error, can retry', async ({ page }) => {
    await page.route('**/api/claude', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"fail"}' }));
    await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/parse-resume', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"text":"r"}' }));
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('Err');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('E');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText(/failed|Could not parse/i)).toBeVisible({ timeout: 10000 });
    // Button re-enables for retry
    await expect(page.getByRole('button', { name: /Analyze with Aster/i })).toBeEnabled({ timeout: 5000 });
    // No blank screen
    await expect(page.getByText('Analyze a job')).toBeVisible();
  });

  test('Claude malformed JSON → error with retry', async ({ page }) => {
    await page.route('**/api/claude', (route, req) => {
      const body = JSON.parse(req.postData());
      if (body.messages?.[0]?.content?.includes('Extract the company')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '{}' }] }) });
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: 'Here is analysis: {"fitScore": 77, broken...' }] }) });
      }
    });
    await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/parse-resume', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"text":"r"}' }));
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('Malformed');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('E');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText(/Could not parse/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Analyze with Aster/i })).toBeEnabled({ timeout: 3000 });
  });

  test('empty textarea → analyze button disabled', async ({ page }) => {
    await page.route('**/api/claude', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await expect(page.getByRole('button', { name: /Analyze with Aster/i })).toBeDisabled();
  });

  test('whitespace-only textarea → analyze button disabled', async ({ page }) => {
    await page.route('**/api/claude', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill('   ');
    await expect(page.getByRole('button', { name: /Analyze with Aster/i })).toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCRAPER ERRORS
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Scraper error handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/parse-resume', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"text":"r"}' }));
    await page.route('**/api/claude', (route, req) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '{}' }] }) });
    });
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.getByText('Have a link?').click();
  });

  test('blocked domain shows error card with paste button', async ({ page }) => {
    await page.route('**/api/scrape', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'dynamic_site', message: 'Lever blocks automated access. Copy the description.' }),
    }));
    await page.locator('input[placeholder*="greenhouse"]').fill('https://jobs.lever.co/company/123');
    await page.getByRole('button', { name: 'Extract' }).click();
    await expect(page.getByText('Lever blocks')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Works best with Greenhouse')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Paste the description instead' })).toBeVisible();
  });

  test('no_content shows error card', async ({ page }) => {
    await page.route('**/api/scrape', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'no_content', message: "Couldn't find a job description on that page." }),
    }));
    await page.locator('input[placeholder*="greenhouse"]').fill('https://example.com/empty');
    await page.getByRole('button', { name: 'Extract' }).click();
    await expect(page.getByText("Couldn't find a job description")).toBeVisible({ timeout: 5000 });
  });

  test('paste instead button switches to textarea', async ({ page }) => {
    await page.route('**/api/scrape', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'fetch_failed', message: 'Timeout' }),
    }));
    await page.locator('input[placeholder*="greenhouse"]').fill('https://example.com/slow');
    await page.getByRole('button', { name: 'Extract' }).click();
    await expect(page.getByRole('button', { name: 'Paste the description instead' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Paste the description instead' }).click();
    await expect(page.locator('textarea').first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DATA PRESERVATION ON ERROR
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Data preservation on error', () => {
  test('textarea content preserved after analysis error', async ({ page }) => {
    await page.route('**/api/claude', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"fail"}' }));
    await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill('My important JD text');
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('Kept');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Data');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText(/failed|Could not parse/i)).toBeVisible({ timeout: 10000 });
    // Textarea and inputs should still have their values
    await expect(page.locator('textarea').first()).toHaveValue('My important JD text');
    await expect(page.locator('input[placeholder="e.g. Acme Corp"]')).toHaveValue('Kept');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NO UNHANDLED ERRORS
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('No unhandled errors during normal flow', () => {
  test('full navigation produces zero console errors', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.route('**/api/claude', (route, req) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '{}' }] }) });
    });
    await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await setupStorage(page, 'onboarded-no-jobs');
    for (const tab of ['Analyze', 'Pipeline', 'Outreach', 'Strategy', 'Resume', 'Dashboard']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(300);
    }
    const realErrors = errors.filter(e => !e.includes('favicon') && !e.includes('the server responded'));
    expect(realErrors).toHaveLength(0);
  });
});
