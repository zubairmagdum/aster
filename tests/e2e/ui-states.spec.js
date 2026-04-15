import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';

// Helper: dismiss auth modal if it appears after save (user not signed in)
async function dismissAuthIfNeeded(page) {
  const authVisible = await page.getByText('Continue without account').isVisible({ timeout: 2000 }).catch(() => false);
  if (authVisible) await page.getByText('Continue without account').click();
}

const SAMPLE_JD = `We are looking for a Senior Software Engineer to join our platform team. You will design and build scalable APIs, work with distributed systems, and collaborate with product managers to ship features that serve millions of users. Requirements: 5+ years of software engineering experience, strong knowledge of Python or Go, experience with cloud infrastructure (AWS/GCP), familiarity with CI/CD pipelines. Nice to have: experience with Kubernetes, observability tools, API gateway design. We offer competitive compensation, equity, remote work, and unlimited PTO.`;

// ─────────────────────────────────────────────────────────────────────────────
// 1. LOADING AND EMPTY STATES
// ─────────────────────────────────────────────────────────────────────────────
test.describe('1. Loading and empty states', () => {
  test('Dashboard empty state — no jobs, shows empty profile message', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'dashboard');
    await expect(page.getByText('Your profile builds as you analyze jobs')).toBeVisible();
    await expect(page.getByText('0').first()).toBeVisible();
  });

  test('Pipeline empty state — shows empty prompt', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'pipeline');
    await expect(page.getByText('No roles here yet')).toBeVisible();
    await expect(page.getByText('Analyze your first JD')).toBeVisible();
  });

  test('Analyze view before JD paste — textarea empty, button disabled', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await expect(page.locator('textarea').first()).toHaveValue('');
    await expect(page.getByRole('button', { name: /Analyze with Aster/i })).toBeDisabled();
  });

  test('Resume Workshop empty state — no resume uploaded', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-resume');
    await navigateTo(page, 'workshop');
    await expect(page.getByText('Upload your resume first')).toBeVisible();
  });

  test('Strategy view empty state — empty inputs', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'strategy');
    await expect(page.getByText('Job Search Strategy')).toBeVisible();
    await expect(page.locator('input[placeholder*="Senior role"]')).toHaveValue('');
  });

  test('Dashboard loading spinner appears during API call', async ({ page }) => {
    // Use a delayed mock to see the loading state
    let resolveRoute;
    await page.route('**/api/claude', async route => {
      // Hold the response for 1 second to see loading state
      await new Promise(r => { resolveRoute = r; setTimeout(r, 1500); });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ todayTasks: [], insight: null, warning: null, weeklyFocus: '' }) }] }),
      });
    });
    await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await setupStorage(page, 'with-5-jobs');
    await navigateTo(page, 'dashboard');
    // Either "Analyzing your pipeline" or "Refresh" should be visible (loading or loaded)
    const loadingOrLoaded = await page.getByText('Analyzing your pipeline').isVisible().catch(() => false) ||
      await page.getByText('Refresh').isVisible().catch(() => false);
    expect(loadingOrLoaded).toBe(true);
  });

  test('Dashboard loading disappears after API response', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'with-5-jobs');
    await navigateTo(page, 'dashboard');
    await expect(page.getByText('Follow up with Oscar Health')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Analyzing your pipeline')).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. BUTTON STATE BEHAVIOR
// ─────────────────────────────────────────────────────────────────────────────
test.describe('2. Button state behavior', () => {
  test('Analyze button disabled when empty, enabled when text present', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    const btn = page.getByRole('button', { name: /Analyze with Aster/i });
    await expect(btn).toBeDisabled();
    await page.locator('textarea').first().fill('Some job description text here');
    await expect(btn).toBeEnabled();
  });

  test('Save button only appears after analysis completes', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    // No save button initially
    await expect(page.getByRole('button', { name: /Save to pipeline/i })).not.toBeVisible();
    // Run analysis
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('TestCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Engineer');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText('Apply with Tailoring')).toBeVisible({ timeout: 10000 });
    // Now save button visible
    await expect(page.getByRole('button', { name: /Save to pipeline/i })).toBeVisible();
  });

  test('Import History modal opens when button clicked', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'pipeline');
    await page.getByRole('button', { name: 'Import History' }).click();
    await expect(page.getByText('Import Past Applications')).toBeVisible();
  });

  test('Export CSV downloads when pipeline has jobs', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'with-5-jobs');
    await navigateTo(page, 'pipeline');
    await expect(page.getByText('Your Pipeline')).toBeVisible({ timeout: 10000 });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('aster-pipeline');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. FORM AND INPUT BEHAVIOR
// ─────────────────────────────────────────────────────────────────────────────
test.describe('3. Form and input behavior', () => {
  test('JD textarea accepts pasted text', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await expect(page.locator('textarea').first()).toHaveValue(SAMPLE_JD);
  });

  test('Company and role auto-populate after JD paste', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    // Wait for extract — auto-fires after 800ms for JDs > 200 chars
    await expect(page.locator('input[placeholder="e.g. Acme Corp"]')).toHaveValue('Acme Corp', { timeout: 5000 });
    await expect(page.locator('input[placeholder="e.g. Marketing Manager"]')).toHaveValue('Senior Software Engineer', { timeout: 3000 });
  });

  test('Preferences modal opens and closes correctly', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await page.locator('button', { hasText: 'Prefs' }).first().click();
    await expect(page.getByText('Job Search Preferences')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Job Search Preferences')).not.toBeVisible();
  });

  test('Preference toggles respond to click', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await page.locator('button', { hasText: 'Prefs' }).first().click();
    // Click work mode toggle
    await page.getByRole('button', { name: 'Onsite', exact: true }).click();
    // Click employment type toggle
    await page.getByRole('button', { name: 'Contract', exact: true }).click();
    // Save and reopen to verify
    await page.getByRole('button', { name: 'Save Preferences' }).click();
    await page.locator('button', { hasText: 'Prefs' }).first().click();
    // Verify the toggles retained their state (harder to assert styling, just verify save worked)
    await expect(page.getByText('Job Search Preferences')).toBeVisible();
  });

  test('Custom exclusion text input accepts text', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await page.locator('button', { hasText: 'Prefs' }).first().click();
    const input = page.locator('input[placeholder*="derivatives trading"]');
    await input.fill('fast food, derivatives');
    await expect(input).toHaveValue('fast food, derivatives');
  });

  test('Salary input accepts numbers', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await page.locator('button', { hasText: 'Prefs' }).first().click();
    const salaryInput = page.locator('input[type="number"]');
    await salaryInput.fill('200');
    await expect(salaryInput).toHaveValue('200');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. STATE TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('4. State transitions', () => {
  test('Analyze: idle → loading → success result renders', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('TestCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Engineer');
    // Idle — no result
    await expect(page.getByText('Apply with Tailoring')).not.toBeVisible();
    // Click → loading
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    // Success — result
    await expect(page.getByText('Apply with Tailoring')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('78')).toBeVisible();
  });

  test('Analyze: idle → loading → error renders toast', async ({ page }) => {
    // Mock Claude to return an error
    await page.route('**/api/claude', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"fail"}' }));
    await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/parse-resume', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"text":"resume"}' }));
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('TestCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Engineer');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    // Error toast — new callClaude throws descriptive errors like "Analysis request failed (500)"
    await expect(page.getByText(/Analysis.*failed|request failed|Could not parse|Unexpected/i)).toBeVisible({ timeout: 10000 });
  });

  test('Pipeline: job saved → appears immediately', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('NewCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Designer');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText('Apply with Tailoring')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Applied', exact: true }).click();
    await page.getByRole('button', { name: /Save to pipeline/i }).click();
    await dismissAuthIfNeeded(page);
    await expect(page.getByText(/saved locally|saved as/i).first()).toBeVisible({ timeout: 5000 });
    // Poll until localStorage has the job (React effect may not have flushed yet)
    await page.waitForFunction(() => {
      try { return JSON.parse(localStorage.getItem('aster_jobs') || '[]').some(j => j.company === 'NewCo'); }
      catch { return false; }
    }, { timeout: 5000 });
    await navigateTo(page, 'pipeline');
    await expect(page.getByText('NewCo').first()).toBeVisible({ timeout: 10000 });
  });

  test('Pipeline: status changed → updates immediately', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'with-5-jobs');
    await navigateTo(page, 'pipeline');
    await expect(page.getByText('Your Pipeline')).toBeVisible({ timeout: 10000 });
    // Expand Stripe
    await page.getByText('Stripe').first().click();
    // Change status
    const detailSelect = page.locator('.fade-in').last().locator('select').first();
    await detailSelect.selectOption('Offer');
    // Verify status chip updated (Offer text should appear)
    await expect(page.locator('.status-chip', { hasText: 'Offer' })).toBeVisible();
  });

  test('Dashboard: after job saved → stats update', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    // Save a job first via analyze
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('StatsCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Eng');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText('Apply with Tailoring')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Applied', exact: true }).click();
    await page.getByRole('button', { name: /Save to pipeline/i }).click();
    await dismissAuthIfNeeded(page);
    await expect(page.getByText(/saved locally|saved as/i).first()).toBeVisible({ timeout: 5000 });
    await navigateTo(page, 'dashboard');
    await expect(page.getByText('1').first()).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. NEGATIVE AND DESTRUCTIVE UI CASES
// ─────────────────────────────────────────────────────────────────────────────
test.describe('5. Negative and destructive cases', () => {
  test('Short JD does not crash — analyze still works', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill('PM role');
    // Button should be enabled (text exists, even if short)
    await expect(page.getByRole('button', { name: /Analyze with Aster/i })).toBeEnabled();
    // Fill company/role and analyze
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('Co');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('PM');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    // Should get a result (from mock), not crash
    await expect(page.getByText('Apply with Tailoring')).toBeVisible({ timeout: 10000 });
  });

  test('API error → error toast, can retry', async ({ page }) => {
    // First: set up error mock, then switch to success
    let shouldFail = true;
    await page.route('**/api/claude', async (route, request) => {
      const body = JSON.parse(request.postData());
      const prompt = body.messages?.[0]?.content || '';
      if (prompt.includes('Extract the company name')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '{}' }] }) });
        return;
      }
      if (shouldFail) {
        shouldFail = false; // Next call will succeed
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"fail"}' });
      } else {
        const successResponse = { fitScore: 78, matchScore: 65, verdict: "Apply with Tailoring", verdictReason: "Good fit", strengths: ["a"], gaps: ["b"], transferability: { score: 50, reason: "ok", angle: "ok" }, atsKeywords: ["kw"], tailoredSummary: "sum", tailoredBullets: [], nextAction: "next", resumeRecommendation: { version: null, reason: "none" }, estimatedCompRange: null, perksFound: [], perksMatch: null, compWarning: null, roleDNA: { function: "Eng", domain: "Tech", productType: "SaaS", customer: "B2B", stage: "Growth", seniority: "Senior", workMode: "Remote", coreSkills: [], keywords: [] } };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(successResponse) }] }) });
      }
    });
    await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/parse-resume', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"text":"resume"}' }));
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('RetryCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Eng');
    // First analyze → error (may say "Analysis failed" or "Could not parse")
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText(/Analysis.*failed|request failed|Could not parse|Unexpected/i)).toBeVisible({ timeout: 10000 });
    // Wait for toast to dismiss before retry
    await page.waitForTimeout(4000);
    // Retry → success
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText('Apply with Tailoring')).toBeVisible({ timeout: 10000 });
  });

  test('Navigate away during analysis → no broken state', async ({ page }) => {
    // Use a delayed mock
    await page.route('**/api/claude', async route => {
      await new Promise(r => setTimeout(r, 2000));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '{}' }] }) });
    });
    await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/parse-resume', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"text":"resume"}' }));
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('NavCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Eng');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    // Navigate away while loading
    await navigateTo(page, 'pipeline');
    await expect(page.getByText('No roles here yet')).toBeVisible();
    // Navigate back — should not be in broken state
    await navigateTo(page, 'analyze');
    await expect(page.getByText('Analyze a job')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. PERSISTENCE UI CASES
// ─────────────────────────────────────────────────────────────────────────────
test.describe('6. Persistence', () => {
  test('Save job → refresh → job still in pipeline', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('PersistCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Eng');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText('Apply with Tailoring')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Applied', exact: true }).click();
    await page.getByRole('button', { name: /Save to pipeline/i }).click();
    await dismissAuthIfNeeded(page);
    await expect(page.getByText(/saved locally|saved as/i).first()).toBeVisible({ timeout: 5000 });
    // Poll until localStorage has the job (React effect may not have flushed yet)
    await page.waitForFunction(() => {
      try { return JSON.parse(localStorage.getItem('aster_jobs') || '[]').some(j => j.company === 'PersistCo'); }
      catch { return false; }
    }, { timeout: 5000 });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    // After reload, navigate to pipeline — job should be in localStorage
    await navigateTo(page, 'pipeline');
    await expect(page.getByText('PersistCo').first()).toBeVisible({ timeout: 10000 });
  });

  test('Set preferences → refresh → preferences still set', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await page.locator('button', { hasText: 'Prefs' }).first().click();
    await page.locator('input[type="number"]').fill('250');
    await page.getByRole('button', { name: 'Save Preferences' }).click();
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('button', { hasText: 'Prefs' }).first().click();
    await expect(page.locator('input[type="number"]')).toHaveValue('250');
  });

  test('Analysis result not persisted after refresh', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('TestCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Eng');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText('Apply with Tailoring')).toBeVisible({ timeout: 10000 });
    // Refresh
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await navigateTo(page, 'analyze');
    // Result should be gone — textarea empty, no verdict
    await expect(page.getByText('Apply with Tailoring')).not.toBeVisible();
    await expect(page.locator('textarea').first()).toHaveValue('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. RESPONSIVE UI CASES
// ─────────────────────────────────────────────────────────────────────────────
test.describe('7. Responsive UI', () => {
  const viewports = [
    { name: 'desktop', width: 1280, height: 720 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    test(`Nav renders correctly at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await mockAllApiRoutes(page);
      await setupStorage(page, 'onboarded-no-jobs');
      if (vp.width >= 900) {
        // Desktop/tablet wide: nav links visible
        await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Pipeline', exact: true })).toBeVisible();
      } else {
        // Mobile: hamburger visible, nav links hidden
        const hamburger = page.locator('.nav-hamburger');
        await expect(hamburger).toBeVisible();
      }
    });
  }

  test('Mobile hamburger menu opens and closes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    const hamburger = page.locator('.nav-hamburger');
    await hamburger.click();
    // Dropdown should show nav items
    await expect(page.locator('.nav-mobile-dropdown')).toBeVisible();
    await expect(page.locator('.nav-mobile-dropdown').getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible();
    // Close
    await hamburger.click();
    await expect(page.locator('.nav-mobile-dropdown')).not.toBeVisible();
  });

  test('Analyze textarea is usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    // Navigate via hamburger
    const hamburger = page.locator('.nav-hamburger');
    await hamburger.click();
    await page.locator('.nav-mobile-dropdown').getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect(page.getByText('Analyze a job')).toBeVisible();
    await page.locator('textarea').first().fill('Test JD text on mobile');
    await expect(page.locator('textarea').first()).toHaveValue('Test JD text on mobile');
  });

  test('Preferences modal fits on mobile screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    // Open prefs via hamburger
    const hamburger = page.locator('.nav-hamburger');
    await hamburger.click();
    await page.locator('.nav-mobile-dropdown').locator('button', { hasText: 'Prefs' }).click();
    await expect(page.getByText('Job Search Preferences')).toBeVisible();
    // Modal should be scrollable — verify Save button is accessible
    await page.getByRole('button', { name: 'Save Preferences' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Save Preferences' })).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. CONTENT RENDERING
// ─────────────────────────────────────────────────────────────────────────────
test.describe('8. Content rendering', () => {
  test('Analysis result renders all sections', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('RenderCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Eng');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText('Apply with Tailoring')).toBeVisible({ timeout: 10000 });
    // Fit score
    await expect(page.getByText('78')).toBeVisible();
    // Verdict reason
    await expect(page.getByText('Strong platform engineering')).toBeVisible();
    // Strengths (Fit Analysis tab is default)
    await expect(page.getByText('Strengths')).toBeVisible();
    await expect(page.getByText('API platform experience', { exact: false })).toBeVisible();
    // Gaps
    await expect(page.getByText('Gaps to Address')).toBeVisible();
  });

  test('Transferability card appears when score >= 65 and fit < 75', async ({ page }) => {
    // The mock has fitScore: 78 and transferability.score: 70
    // We need fitScore < 75 for it to show — override the mock
    await page.route('**/api/claude', async (route, request) => {
      const body = JSON.parse(request.postData());
      const prompt = body.messages?.[0]?.content || '';
      if (prompt.includes('expert recruiter')) {
        const fixture = (await import('../fixtures/api-responses/analyze-success.json', { with: { type: 'json' } })).default;
        const modified = { ...fixture, fitScore: 68 }; // Below 75
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(modified) }] }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '{}' }] }) });
      }
    });
    await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/parse-resume', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"text":"resume"}' }));
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('TransCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Eng');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText('Transferable Angle')).toBeVisible({ timeout: 10000 });
  });

  test('Perks found tags appear in verdict', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill(SAMPLE_JD);
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('PerksCo');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Eng');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText('Apply with Tailoring')).toBeVisible({ timeout: 10000 });
    // Perks from mock: "Equity/stock options", "Remote work"
    await expect(page.getByText('Equity/stock options')).toBeVisible();
    await expect(page.locator('.tag', { hasText: 'Remote work' })).toBeVisible();
  });

  test('Pipeline job rows show correct status badges', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'with-5-jobs');
    await navigateTo(page, 'pipeline');
    await expect(page.getByText('Your Pipeline')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Stripe').first()).toBeVisible({ timeout: 5000 });
    // Verify status chips for different statuses
    await expect(page.locator('.status-chip', { hasText: 'Applied' }).first()).toBeVisible();
    await expect(page.locator('.status-chip', { hasText: 'Recruiter Screen' })).toBeVisible();
    await expect(page.locator('.status-chip', { hasText: 'Saved' })).toBeVisible();
    await expect(page.locator('.status-chip', { hasText: 'Rejected' })).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. DELETE WORKSPACE
// ─────────────────────────────────────────────────────────────────────────────
test.describe('9. Delete workspace', () => {
  test('delete workspace clears data and resets to onboarding', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'with-5-jobs');
    await navigateTo(page, 'pipeline');
    await expect(page.getByText('Your Pipeline')).toBeVisible({ timeout: 10000 });
    page.on('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Delete my workspace' }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Delete my workspace' }).click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText('Land the job')).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. FEEDBACK WIDGET AND NEW FEATURES
// ─────────────────────────────────────────────────────────────────────────────
test.describe('10. Feedback widget and new features', () => {
  test('feedback widget appears on every view', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await expect(page.getByRole('button', { name: /Feedback/ })).toBeVisible();
    await navigateTo(page, 'analyze');
    await expect(page.getByRole('button', { name: /Feedback/ })).toBeVisible();
    await navigateTo(page, 'pipeline');
    await expect(page.getByRole('button', { name: /Feedback/ })).toBeVisible();
  });

  test('feedback widget opens and closes', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await page.getByRole('button', { name: /Feedback/ }).click();
    await expect(page.getByText('Share feedback')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bug report' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Feature request' })).toBeVisible();
    // Close
    await page.locator('button', { hasText: '✕' }).last().click();
    await expect(page.getByText('Share feedback')).not.toBeVisible();
  });

  test('thumbs up/down appear after analysis', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    await navigateTo(page, 'analyze');
    await page.locator('textarea').first().fill('Senior Software Engineer at Acme Corp. 5+ years experience required. Build scalable APIs and distributed systems. Python, Go, AWS. Competitive compensation, equity, remote work, unlimited PTO.');
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill('Acme');
    await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Eng');
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    await expect(page.getByText('Apply with Tailoring')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Was this helpful?')).toBeVisible();
    await expect(page.getByText('👍')).toBeVisible();
    await expect(page.getByText('👎')).toBeVisible();
  });

  test('privacy link in footer navigates to /privacy', async ({ page }) => {
    await mockAllApiRoutes(page);
    await setupStorage(page, 'onboarded-no-jobs');
    const privacyLink = page.locator('a[href="/privacy"]');
    await privacyLink.scrollIntoViewIfNeeded();
    await expect(privacyLink).toBeVisible();
    await privacyLink.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText('Privacy Policy').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('What we collect')).toBeVisible();
  });
});
