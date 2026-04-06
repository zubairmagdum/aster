import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';

const SAMPLE_JD = `We are looking for a Senior Software Engineer to join our platform team. You will design and build scalable APIs, work with distributed systems, and collaborate with product managers to ship features. Requirements: 5+ years experience, Python or Go, AWS/GCP, CI/CD. We offer equity, remote work, and unlimited PTO.`;

function claudeEnvelope(text) {
  return JSON.stringify({ content: [{ type: 'text', text }] });
}

async function setupAnalyzeView(page) {
  // Mock parse-resume and infer-prefs to prevent interference
  await page.route('**/api/parse-resume', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"text":"resume"}' }));
  await page.route('**/api/infer-prefs', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await setupStorage(page, 'onboarded-no-jobs');
  await navigateTo(page, 'analyze');
  await page.locator('textarea').first().fill(SAMPLE_JD);
  await page.locator('input[placeholder="e.g. Acme Corp"]').fill('TestCo');
  await page.locator('input[placeholder="e.g. Marketing Manager"]').fill('Engineer');
}

test.describe('API Resilience — Malformed Claude Responses', () => {

  test('1. Malformed JSON → error toast, no crash, can retry', async ({ page }) => {
    await page.route('**/api/claude', async (route, request) => {
      const body = JSON.parse(request.postData());
      const prompt = body.messages?.[0]?.content || '';
      if (prompt.includes('Extract the company name')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: claudeEnvelope('{}') });
        return;
      }
      // Return truncated, malformed JSON
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: claudeEnvelope('Here is your analysis: {"fitScore": 77, "fitSummary": "incomplete...'),
      });
    });
    await setupAnalyzeView(page);
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    // Should show error toast, not crash
    await expect(page.getByText(/Could not parse AI response/)).toBeVisible({ timeout: 10000 });
    // Analyze button should re-enable for retry
    await expect(page.getByRole('button', { name: /Analyze with Aster/i })).toBeEnabled({ timeout: 5000 });
    // Page is still functional — no white screen
    await expect(page.getByText('Analyze a job')).toBeVisible();
  });

  test('2. Markdown-wrapped JSON → analysis renders correctly', async ({ page }) => {
    const validResult = {
      fitScore: 82, matchScore: null, verdict: 'Apply Now',
      verdictReason: 'Strong fit for this role.',
      strengths: ['API experience', 'Distributed systems', 'Cloud infra'],
      gaps: ['No Go experience'],
      transferability: { score: 80, reason: 'Platform skills transfer', angle: 'Lead with API work' },
      atsKeywords: ['Python', 'AWS', 'CI/CD'],
      tailoredSummary: 'Experienced engineer with platform focus.',
      tailoredBullets: [{ bullet: 'Built APIs at scale', job: 'Previous', action: 'add', replaces: null }],
      nextAction: 'Apply within 48 hours',
      resumeRecommendation: { version: null, reason: 'Create versions first' },
      estimatedCompRange: '$170K - $220K',
      perksFound: ['Remote work', 'Equity/stock options'],
      perksMatch: 'Good match',
      compWarning: null,
      roleDNA: { function: 'Engineering', domain: 'Technology', productType: 'Platform', customer: 'Developers', stage: 'Growth', seniority: 'Senior', workMode: 'Remote', coreSkills: ['Python', 'APIs'], keywords: ['distributed systems'] },
    };
    // Wrap valid JSON in markdown fences
    const wrappedResponse = '```json\n' + JSON.stringify(validResult) + '\n```';
    await page.route('**/api/claude', async (route, request) => {
      const body = JSON.parse(request.postData());
      const prompt = body.messages?.[0]?.content || '';
      if (prompt.includes('Extract the company name')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: claudeEnvelope('{}') });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: claudeEnvelope(wrappedResponse),
      });
    });
    await setupAnalyzeView(page);
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    // Should parse correctly despite markdown fences
    await expect(page.getByText('Apply Now')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('82')).toBeVisible();
    await expect(page.getByText('Strong fit for this role')).toBeVisible();
  });

  test('3. Empty response → error toast, no crash', async ({ page }) => {
    await page.route('**/api/claude', async (route, request) => {
      const body = JSON.parse(request.postData());
      const prompt = body.messages?.[0]?.content || '';
      if (prompt.includes('Extract the company name')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: claudeEnvelope('{}') });
        return;
      }
      // Return Anthropic envelope with no content
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });
    await setupAnalyzeView(page);
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    // safeParseClaudeResponse("") → _parseError
    await expect(page.getByText(/Could not parse AI response/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Analyze a job')).toBeVisible();
  });

  test('4. 500 error → error toast, button re-enables', async ({ page }) => {
    await page.route('**/api/claude', async (route, request) => {
      const body = JSON.parse(request.postData());
      const prompt = body.messages?.[0]?.content || '';
      if (prompt.includes('Extract the company name')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: claudeEnvelope('{}') });
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });
    await setupAnalyzeView(page);
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    // Should show some error toast
    await expect(page.getByText(/Could not parse|Analysis failed/)).toBeVisible({ timeout: 10000 });
    // Button should re-enable
    await expect(page.getByRole('button', { name: /Analyze with Aster/i })).toBeEnabled({ timeout: 5000 });
  });

  test('5. Missing fields → renders what it can, no crash', async ({ page }) => {
    const partialResult = { fitScore: 72 };
    await page.route('**/api/claude', async (route, request) => {
      const body = JSON.parse(request.postData());
      const prompt = body.messages?.[0]?.content || '';
      if (prompt.includes('Extract the company name')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: claudeEnvelope('{}') });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: claudeEnvelope(JSON.stringify(partialResult)),
      });
    });
    await setupAnalyzeView(page);
    await page.getByRole('button', { name: /Analyze with Aster/i }).click();
    // Should render the fitScore without crashing
    await expect(page.getByText('72')).toBeVisible({ timeout: 10000 });
    // Verdict will be undefined but should not crash the page
    await expect(page.getByText('Analyze a job')).toBeVisible();
    // Strengths/gaps sections should exist but be empty (no crash)
    await expect(page.getByText('Strengths')).toBeVisible();
  });
});
