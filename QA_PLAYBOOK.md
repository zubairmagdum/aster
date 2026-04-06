# AsterCopilot QA Implementation Playbook

Execute these 10 steps in exact order. Each step is a single Claude Code prompt.

---

## Step 1: Install Test Dependencies

### What this builds
Installs Vitest (unit test runner), Playwright (E2E browser automation), MSW (API mocking), and axe-core (accessibility testing). Adds test scripts to package.json. Creates config files for both runners.

### Why it comes first
Nothing else can run without the test framework installed and configured. This is pure infrastructure with zero risk to existing code.

### Expected files created/modified
- `package.json` (modified — new devDependencies and scripts)
- `vitest.config.js` (created)
- `playwright.config.js` (created)

### Dependencies installed
- `vitest`, `jsdom`, `@vitejs/plugin-react` (unit testing)
- `@playwright/test` (E2E testing)
- `msw` (API mocking)
- `@axe-core/playwright` (accessibility)

### Rollback risk
None. Only adds devDependencies and config files. No production code touched.

### How to verify
```
npx vitest --version
npx playwright --version
npm run build   # still succeeds
```

### Prompt

```
Read package.json and the full file listing of this repo. This is a Next.js 16 Pages Router app deployed on Vercel. The entire frontend is in pages/index.js. There are 3 API routes in pages/api/. There are currently zero tests.

Do the following:

1. Install test dependencies:
npm install -D vitest jsdom @vitejs/plugin-react @playwright/test msw@latest @axe-core/playwright

2. Run: npx playwright install --with-deps chromium

3. Create vitest.config.js at repo root:
- import { defineConfig } from 'vitest/config'
- import react from '@vitejs/plugin-react'
- Set test.environment to 'jsdom'
- Set test.include to ['tests/unit/**/*.test.js', 'tests/api/**/*.test.js']
- Set test.globals to true
- Set plugins to [react()]

4. Create playwright.config.js at repo root:
- import { defineConfig, devices } from '@playwright/test'
- Set testDir to './tests/e2e'
- Set fullyParallel to true
- Set retries to process.env.CI ? 1 : 0
- Set reporter to [['html', { open: 'never' }], ['list']]
- Set use.baseURL to 'http://localhost:3000'
- Set use.trace to 'on-first-retry'
- Set use.screenshot to 'only-on-failure'
- Set use.video to 'retain-on-failure'
- Configure projects: chromium only (using devices['Desktop Chrome'])
- Set webServer.command to 'npm run dev'
- Set webServer.port to 3000
- Set webServer.reuseExistingServer to !process.env.CI
- Set webServer.timeout to 30000

5. Add these scripts to package.json:
- "test": "vitest run"
- "test:watch": "vitest"
- "test:e2e": "playwright test"
- "test:e2e:headed": "playwright test --headed"

6. Add to .gitignore:
test-results/
playwright-report/
tests/artifacts/

7. Create empty directory structure:
tests/unit/.gitkeep
tests/api/.gitkeep
tests/e2e/.gitkeep
tests/fixtures/.gitkeep
tests/helpers/.gitkeep

8. Verify npm run build still works.

Do not modify any existing source code. Output a summary of everything you created.

After changes: git add -A && git commit -m "install test framework: vitest, playwright, msw, axe-core" && git push
```

---

## Step 2: Extract Pure Functions for Testability

### What this builds
Moves pure utility functions from pages/index.js into lib/utils.js so they can be imported and tested in isolation. Updates pages/index.js to import from the new module.

### Why it comes now
Unit tests need importable functions. Currently everything is in one monolith file. This is the minimal extraction needed to enable testing without restructuring the entire app.

### Expected files created/modified
- `lib/utils.js` (created — extracted functions)
- `pages/index.js` (modified — imports from lib/utils.js, function bodies removed)

### Dependencies installed
None.

### Rollback risk
Low. Pure refactor — same functions, same behavior, just moved. Build verification confirms nothing broke.

### How to verify
```
npm run build         # still succeeds
npm run dev           # app works identically
```

### Prompt

```
Read pages/index.js completely. I need to extract pure utility functions into a separate module for unit testing. This must be a pure refactor — zero behavior changes.

1. Create lib/utils.js with these functions copied exactly from pages/index.js:

a) The entire checkHardSkip function (lines ~40-110), including the domainMap object and mgmtRequired array inside it.

b) function updateProfile(currentProfile, roleDNA, outcome) — the profile learning function that boosts category scores.

c) function matchScore(roleDNA, profile) — the score calculation function.

d) function topProfileTags(profile, cat, n) — the tag extraction one-liner.

e) function getWeekKey(ts) — the week key calculator.

f) The DEFAULT_PREFS object.

g) The STATUSES array and STATUS_CFG object (checkHardSkip doesn't need these but other tests will).

2. Export all of them as named exports from lib/utils.js.

3. In pages/index.js, add this import at the top (after the React import):
import { checkHardSkip, updateProfile, matchScore, topProfileTags, getWeekKey, DEFAULT_PREFS, STATUSES, STATUS_CFG } from '../lib/utils';

4. Remove the function bodies of checkHardSkip, updateProfile, matchScore, topProfileTags, getWeekKey from pages/index.js. Also remove the duplicated DEFAULT_PREFS, STATUSES, and STATUS_CFG declarations from pages/index.js.

5. Keep any other references to these in pages/index.js intact — they should now resolve via the import.

6. IMPORTANT: The domainMap in checkHardSkip is large (48 entries). Copy it exactly. Do not truncate.

7. IMPORTANT: Keep the T (brand tokens), RADIUS, SHADOW objects in pages/index.js — they are only used for rendering and should NOT be extracted.

8. Run npm run build and verify it succeeds.

9. Output a summary listing:
- Each function extracted
- Each constant extracted  
- Line count of lib/utils.js
- Confirmation that npm run build passes

After changes: git add -A && git commit -m "extract pure functions to lib/utils.js for testability" && git push
```

---

## Step 3: Write Unit Tests for Core Logic

### What this builds
Unit tests for the 5 extracted functions covering happy paths, edge cases, and failure modes. This is the fastest path to real test coverage.

### Why it comes now
Functions are now importable. Unit tests are the cheapest tests to write and run (<2 seconds). They cover the most critical business logic: hard skip filtering, profile scoring, and data parsing.

### Expected files created/modified
- `tests/unit/checkHardSkip.test.js` (created)
- `tests/unit/updateProfile.test.js` (created)
- `tests/unit/matchScore.test.js` (created)
- `tests/unit/topProfileTags.test.js` (created)

### Dependencies installed
None.

### Rollback risk
None. Only adds test files. No production code touched.

### How to verify
```
npx vitest run --reporter=verbose
# Expect: all tests pass, 0 failures
```

### Prompt

```
Read lib/utils.js completely. Write unit tests using Vitest (already configured in vitest.config.js with globals: true, so describe/it/expect are available without imports).

Create tests/unit/checkHardSkip.test.js:

import { checkHardSkip } from '../../lib/utils';

Tests to write:
1. "returns empty array when prefs has no exclusions" — pass empty excludedIndustries, empty customExclusions, hasPeopleManagement true. JD text: "Senior software engineer at Google". Expect: []
2. "detects Gaming domain in JD" — prefs.excludedIndustries: ["Gaming"]. JD: "We are a video game studio building esports platforms". Expect array containing "Domain excluded: Gaming"
3. "detects Cybersecurity domain" — prefs.excludedIndustries: ["Cybersecurity"]. JD: "Looking for a penetration testing expert in cybersecurity". Expect match.
4. "detects custom exclusion term" — prefs.customExclusions: "fast food, real estate". JD: "Managing fast food restaurant operations". Expect array containing "Domain excluded: fast food"
5. "detects people management when hasPeopleManagement is false" — prefs.hasPeopleManagement: false. JD: "You will manage a team of 5 engineers". Expect array containing "Requires people management experience"
6. "does NOT flag people management when hasPeopleManagement is true" — prefs.hasPeopleManagement: true. Same JD. Expect empty or no people mgmt reason.
7. "detects salary below floor" — prefs.minSalary: 200000. JD: "Salary range $80k - $120k". Expect salary warning.
8. "does not warn when salary is above floor" — prefs.minSalary: 100000. JD: "Salary range $150k - $200k". Expect no salary warning.
9. "returns multiple reasons" — combine Gaming exclusion + people mgmt in one JD. Expect 2+ reasons.
10. "handles empty JD gracefully" — JD: "". Expect: []
11. "handles undefined prefs fields" — pass prefs: {}. Expect no crash, return []
12. "detects location exclusion" — prefs.excludedCities: ["San Francisco"]. JD: "This role is based in San Francisco". Expect location warning.

Create tests/unit/updateProfile.test.js:

import { updateProfile } from '../../lib/utils';

Tests:
1. "adds domain to empty profile" — currentProfile: {}, roleDNA: {domain: "Healthcare"}, outcome: "saved". Expect result.domain.Healthcare to be 1.
2. "increments existing domain" — currentProfile: {domain:{Healthcare:2}}, roleDNA: {domain:"Healthcare"}, outcome: "saved". Expect result.domain.Healthcare to be 3.
3. "applies higher boost for later stages" — outcome: "offer" (boost 4). Expect domain value to be 4, not 1.
4. "adds skills from roleDNA" — roleDNA with coreSkills: ["Python", "SQL"]. Expect result.skills.Python and result.skills.SQL.
5. "handles missing roleDNA categories gracefully" — roleDNA: {domain:"AI"} (no productType, customer, etc). Expect no crash.

Create tests/unit/matchScore.test.js:

import { matchScore } from '../../lib/utils';

Tests:
1. "returns null when profile is empty" — matchScore({domain:"AI"}, {}). Expect null.
2. "returns null when roleDNA is null" — matchScore(null, {domain:{AI:5}}). Expect null.
3. "returns number between 0-100" — valid roleDNA and profile. Expect typeof number, >= 0, <= 100.
4. "returns higher score for matching domains" — profile has high AI weight, roleDNA domain is AI. Expect score > 50.
5. "returns lower score for non-matching" — profile has high Healthcare weight, roleDNA domain is Gaming. Expect score < 50 or 0.

Create tests/unit/topProfileTags.test.js:

import { topProfileTags } from '../../lib/utils';

Tests:
1. "returns empty array when category missing" — topProfileTags({}, "domain"). Expect [].
2. "returns top 3 by default" — profile.domain has 5 entries. Expect array of length 3.
3. "returns sorted by weight descending" — profile.domain: {AI:10, Healthcare:5, Fintech:8}. Expect ["AI","Fintech","Healthcare"].
4. "respects n parameter" — topProfileTags(profile, "domain", 1). Expect array of length 1.

Run: npx vitest run --reporter=verbose

Output a summary: number of test files, number of tests, pass/fail count.

After changes: git add -A && git commit -m "add unit tests for checkHardSkip, updateProfile, matchScore, topProfileTags" && git push
```

---

## Step 4: Create Test Fixtures and Helpers

### What this builds
Reusable localStorage fixtures (pre-configured app states) and helper functions for E2E tests. These let every E2E test start from a known state without going through onboarding.

### Why it comes now
E2E tests (next step) need a way to inject app state. Without fixtures, every test would need to go through onboarding, which is slow and fragile.

### Expected files created/modified
- `tests/fixtures/localStorage/empty.json` (created)
- `tests/fixtures/localStorage/onboarded-no-jobs.json` (created)
- `tests/fixtures/localStorage/with-5-jobs.json` (created)
- `tests/fixtures/api-responses/analyze-success.json` (created)
- `tests/helpers/setup-storage.js` (created)
- `tests/helpers/navigate-to.js` (created)

### Dependencies installed
None.

### Rollback risk
None. Only adds test infrastructure files.

### How to verify
Files exist and are valid JSON:
```
node -e "require('./tests/fixtures/localStorage/with-5-jobs.json')"
```

### Prompt

```
Read pages/index.js. I need test fixtures and helpers for Playwright E2E tests. Study how the app reads from localStorage to understand the exact keys and data shapes needed.

The app uses these localStorage keys (find them by searching for Store.get and localStorage.getItem):
- aster_onboarded (boolean)
- aster_resume (string — resume text)
- aster_resume_name (string — file name)
- aster_jobs (array of job objects)
- aster_contacts (array of contact objects)
- aster_profile (object — learned role profile)
- aster_prefs (object — user preferences matching DEFAULT_PREFS shape)
- aster_email (string)
- aster_events (array — analytics events)
- aster_target_role (string — strategy view)
- aster_whats_working (string — strategy view)
- aster_whats_not_working (string — strategy view)
- aster_strategy_brief (object — strategy brief result)
- aster_resume_versions (object — resume workshop versions)
- aster_uid (string — analytics user ID)

1. Create tests/fixtures/localStorage/empty.json:
Just {} — represents a brand new user with no data.

2. Create tests/fixtures/localStorage/onboarded-no-jobs.json:
{
  "aster_onboarded": true,
  "aster_resume": "Jane Smith — Senior Product Manager with 7 years experience. Led platform products at Stripe (2020-2024) and growth products at Airbnb (2017-2020). Skills: product strategy, A/B testing, SQL, cross-functional leadership, 0-to-1 launches. Education: MBA Stanford, BS Computer Science MIT.",
  "aster_resume_name": "jane-smith-resume.pdf",
  "aster_jobs": [],
  "aster_contacts": [],
  "aster_profile": {},
  "aster_prefs": {
    "minSalary": 180000,
    "workMode": "Remote",
    "employmentType": "Full-time",
    "seniorityTarget": "Senior",
    "hasPeopleManagement": false,
    "excludedIndustries": ["Gaming"],
    "excludedCities": [],
    "targetIndustries": ["AI/ML", "SaaS"],
    "importantPerks": ["Equity/stock options", "Remote work"],
    "customExclusions": "",
    "customTargetIndustries": ""
  },
  "aster_email": ""
}

3. Create tests/fixtures/localStorage/with-5-jobs.json:
Same as onboarded-no-jobs but with aster_jobs containing exactly 5 jobs. Create realistic data:

Job 1: { id: "job_1", company: "Stripe", role: "Senior PM, Payments", status: "Applied", fitScore: 82, matchScore: 75, dateAdded: "<7 days ago ISO date>", estimatedCompRange: "$180K - $250K", roleDNA: { domain: "Fintech", productType: "Platform", customer: "B2B Enterprise", stage: "Growth", function: "PM", seniority: "Sr PM", workMode: "Remote", coreSkills: ["payments", "platform"], keywords: ["API", "fintech"] }, aiAnalysis: null, notes: "" }

Job 2: { id: "job_2", company: "Oscar Health", role: "Product Manager, Member Experience", status: "Recruiter Screen", fitScore: 71, matchScore: 60, dateAdded: "<5 days ago>", estimatedCompRange: "$150K - $190K", roleDNA: { domain: "Healthcare", productType: "Consumer", customer: "B2C", stage: "Growth", function: "PM", seniority: "PM", workMode: "Hybrid", coreSkills: ["healthcare", "member experience"], keywords: ["health", "member"] }, aiAnalysis: null, notes: "Recruiter call scheduled Thursday" }

Job 3: { id: "job_3", company: "Anthropic", role: "Product Manager, Claude API", status: "Saved", fitScore: 91, matchScore: 88, dateAdded: "<3 days ago>", estimatedCompRange: "$200K - $280K + equity", roleDNA: { domain: "AI", productType: "Platform", customer: "B2B Enterprise", stage: "Growth", function: "PM", seniority: "Sr PM", workMode: "Hybrid", coreSkills: ["AI", "API", "developer tools"], keywords: ["LLM", "API"] }, aiAnalysis: null, notes: "" }

Job 4: { id: "job_4", company: "Datadog", role: "Senior PM, Observability", status: "Applied", fitScore: 68, matchScore: 55, dateAdded: "<12 days ago>", estimatedCompRange: "$170K - $230K", roleDNA: { domain: "SaaS", productType: "Platform", customer: "B2B Enterprise", stage: "Public", function: "PM", seniority: "Sr PM", workMode: "Hybrid", coreSkills: ["observability", "infrastructure"], keywords: ["monitoring", "SaaS"] }, aiAnalysis: null, notes: "" }

Job 5: { id: "job_5", company: "Calm", role: "PM, Growth", status: "Rejected", fitScore: 58, matchScore: 40, dateAdded: "<14 days ago>", estimatedCompRange: "$140K - $175K", roleDNA: { domain: "Consumer", productType: "Consumer", customer: "B2C", stage: "Growth", function: "PM", seniority: "PM", workMode: "Remote", coreSkills: ["growth", "lifecycle"], keywords: ["wellness", "B2C"] }, aiAnalysis: null, notes: "Generic rejection" }

Also set aster_profile to: { domain: { Fintech: 3, Healthcare: 2, AI: 1 }, productType: { Platform: 4, Consumer: 2 }, customer: { "B2B Enterprise": 3, "B2C": 2 }, skills: { payments: 2, healthcare: 1, AI: 1 } }

IMPORTANT: For dateAdded values, compute actual ISO date strings relative to today's date so tests are not stale. Use the format "YYYY-MM-DD".

4. Create tests/fixtures/api-responses/analyze-success.json:
A realistic Claude API response for a successful analysis. This should match what callClaude returns after JSON.parse — the inner parsed object, not the Anthropic envelope. Include: fitScore: 78, matchScore: 65, verdict: "Apply with Tailoring", verdictReason, strengths (3), gaps (2), transferability (score: 70, reason, angle), atsKeywords (5), tailoredSummary, tailoredBullets (3), nextAction, resumeRecommendation (version: null, reason), estimatedCompRange: "$160K - $210K", perksFound (2), perksMatch: "Good match", compWarning: null, roleDNA (all fields filled).

5. Create tests/helpers/setup-storage.js:
```javascript
import fs from 'fs';
import path from 'path';

export async function setupStorage(page, fixtureName) {
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'localStorage', `${fixtureName}.json`);
  const data = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  
  await page.goto('/');
  await page.evaluate((storageData) => {
    localStorage.clear();
    Object.entries(storageData).forEach(([key, value]) => {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    });
  }, data);
  await page.reload();
  await page.waitForLoadState('networkidle');
}
```

6. Create tests/helpers/navigate-to.js:
```javascript
export async function navigateTo(page, viewName) {
  const navLabels = {
    dashboard: 'Dashboard',
    analyze: 'Analyze',
    pipeline: 'Pipeline',
    outreach: 'Outreach',
    strategy: 'Strategy',
    workshop: 'Resume',
  };
  const label = navLabels[viewName];
  if (!label) throw new Error(`Unknown view: ${viewName}`);
  await page.getByRole('button', { name: label }).click();
  await page.waitForTimeout(300);
}
```

Output a summary of all files created with their sizes.

After changes: git add -A && git commit -m "add test fixtures and E2E helpers for localStorage injection" && git push
```

---

## Step 5: Write Critical Path E2E Tests

### What this builds
5 E2E test files covering the most important user journeys: navigation, onboarding, analyze flow, pipeline management, and preferences. Uses Playwright with API mocking so tests don't hit the real Claude API.

### Why it comes now
Fixtures and helpers are ready. E2E tests provide the highest confidence per test — they verify what the user actually sees and does. Critical path first, edge cases later.

### Expected files created/modified
- `tests/e2e/navigation.spec.js` (created)
- `tests/e2e/analyze.spec.js` (created)
- `tests/e2e/pipeline.spec.js` (created)
- `tests/e2e/preferences.spec.js` (created)
- `tests/e2e/onboarding.spec.js` (created)

### Dependencies installed
None.

### Rollback risk
None. Only adds test files.

### How to verify
```
npx playwright test --reporter=list
# Expect: all tests pass
```

### Prompt

```
Read pages/index.js, tests/helpers/setup-storage.js, tests/helpers/navigate-to.js, tests/fixtures/localStorage/onboarded-no-jobs.json, tests/fixtures/localStorage/with-5-jobs.json, and tests/fixtures/api-responses/analyze-success.json.

Write Playwright E2E tests. All tests should use page.route() to intercept /api/claude and /api/infer-prefs calls and return mocked responses so we never hit the real Claude API.

Create tests/e2e/navigation.spec.js:

```javascript
import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
```

Tests (tag all with { tag: '@critical' }):
1. "app loads without errors" — setupStorage with onboarded-no-jobs, listen for console errors, navigate to /, assert no errors logged, assert page title or Aster logo visible.
2. "all nav tabs are visible" — assert buttons Dashboard, Analyze, Pipeline, Outreach, Strategy, Resume are all visible.
3. "clicking each tab shows correct view" — click each tab, verify a unique element in each view is visible (e.g. Dashboard has "Today's Actions", Pipeline has "Your Pipeline", Analyze has "Analyze a job").
4. "Prefs button opens and closes modal" — click Prefs, assert "Job Search Preferences" heading visible. Click Cancel, assert modal gone.
5. "mobile hamburger at narrow viewport" — set viewport to 375x667, assert hamburger button visible, click it, assert nav links appear in dropdown.

Create tests/e2e/onboarding.spec.js:

Tests:
1. "fresh user sees onboarding" — setupStorage with empty fixture, navigate to /. Assert "Land the job" heading is visible.
2. "skip onboarding goes to app" — click "Skip onboarding", assert Dashboard is visible (nav tabs appear).
3. "onboarded user skips to app" — setupStorage with onboarded-no-jobs, navigate to /. Assert onboarding is NOT visible, nav tabs ARE visible.

Create tests/e2e/analyze.spec.js:

Before each test: setupStorage with onboarded-no-jobs, navigateTo 'analyze'. Mock /api/claude to return the analyze-success fixture wrapped in Anthropic response format: { content: [{ type: "text", text: JSON.stringify(analyzeFixture) }] }.

Tests (tag @critical):
1. "analyze button disabled when textarea empty" — assert Analyze button is disabled.
2. "paste JD and run analysis" — fill textarea with a sample JD (100+ words), fill company "TestCo", fill role "Sr PM", click analyze button, wait for results. Assert verdict card shows "Apply with Tailoring". Assert fit score is visible.
3. "save to pipeline" — after analysis, click save button. Assert toast appears. Navigate to pipeline, assert "TestCo" appears in job list.
4. "hard skip warning appears for excluded domain" — the fixture has excludedIndustries: ["Gaming"]. Paste a JD containing "video game studio" and "esports". Assert hard skip banner with "Domain excluded: Gaming" appears.

Create tests/e2e/pipeline.spec.js:

Before each: setupStorage with with-5-jobs, navigateTo 'pipeline'.

Tests (tag @critical):
1. "all jobs render" — assert 5 job cards visible (count elements matching company names).
2. "filter by status" — click "Applied" filter pill, assert only Applied jobs visible (Stripe, Datadog = 2 jobs).
3. "expand job detail" — click on Stripe job row, assert detail panel with STATUS dropdown visible.
4. "select all and bulk update" — click Select All, assert "5 of 5 selected" text. Select "Recruiter Screen" from bulk dropdown, click Apply. Assert toast with "Updated 5 jobs". Assert all jobs now show Recruiter Screen.
5. "export CSV triggers download" — set up download listener with page.waitForEvent('download'), click Export CSV, assert download triggered, assert file name contains "aster-pipeline".

Create tests/e2e/preferences.spec.js:

Before each: setupStorage with onboarded-no-jobs.

Tests:
1. "prefs modal opens with saved values" — click Prefs, assert salary input shows 180 (from fixture where minSalary is 180000). Assert "Remote" work mode is highlighted.
2. "change salary and save" — change salary to 200, click Save Preferences. Reopen prefs modal, assert salary shows 200.
3. "excluded industries are grouped" — open prefs, assert category labels visible: "Tech & Engineering", "Finance & Legal". Assert Gaming pill is highlighted (already excluded in fixture).
4. "toggle an excluded industry" — click "Cybersecurity" pill to enable it, click Save. Reopen prefs, assert Cybersecurity is highlighted.

Run: npx playwright test --reporter=list

Output: total tests, pass count, fail count, and any failures with details.

After changes: git add -A && git commit -m "add critical path E2E tests for navigation, onboarding, analyze, pipeline, preferences" && git push
```

---

## Step 6: Add Bug Package Reporter

### What this builds
A custom Playwright reporter that automatically generates structured JSON "bug packages" for every test failure. Each package contains everything needed to understand, reproduce, and fix the bug.

### Why it comes now
E2E tests exist and may fail. Without this reporter, failures are just red text in a terminal. With it, every failure becomes a documented, actionable artifact.

### Expected files created/modified
- `tests/reporters/bug-package-reporter.js` (created)
- `playwright.config.js` (modified — add custom reporter)

### Dependencies installed
None.

### Rollback risk
None. Additive only — reporter is passive.

### How to verify
```
# Temporarily break a test, run it, check artifact was generated:
npx playwright test tests/e2e/navigation.spec.js
ls tests/artifacts/bug-packages/
```

### Prompt

```
Read playwright.config.js and the existing test files in tests/e2e/.

Create tests/reporters/bug-package-reporter.js — a custom Playwright reporter.

The reporter must implement the Playwright Reporter interface:

```javascript
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

class BugPackageReporter {
  constructor() {
    this.failures = [];
  }

  onTestEnd(test, result) {
    if (result.status !== 'failed' && result.status !== 'timedOut') return;

    const artifactDir = path.join('tests', 'artifacts', 'bug-packages');
    fs.mkdirSync(artifactDir, { recursive: true });

    let commitSha = 'unknown';
    let branch = 'unknown';
    try { commitSha = execSync('git rev-parse --short HEAD').toString().trim(); } catch {}
    try { branch = execSync('git branch --show-current').toString().trim(); } catch {}

    const testId = test.title.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40);
    const timestamp = new Date().toISOString();
    const bugId = `BUG-${timestamp.slice(0,10).replace(/-/g,'')}-${testId}`;

    const isCritical = test.tags?.includes('@critical');

    const bugPackage = {
      id: bugId,
      title: `${test.parent?.title || 'Test'}: ${test.title}`,
      severity: isCritical ? 'P1' : 'P2',
      category: this.inferCategory(test),
      environment: {
        browser: test.parent?.project?.name || 'chromium',
        os: process.platform,
        nodeVersion: process.version,
        ci: !!process.env.CI,
      },
      test: {
        file: test.location?.file || 'unknown',
        line: test.location?.line || 0,
        fullTitle: `${test.parent?.title || ''} > ${test.title}`,
      },
      expected: 'Test should pass — see test body for specific assertions',
      actual: result.error?.message?.slice(0, 500) || 'Unknown error',
      stackTrace: result.error?.stack?.slice(0, 1000) || '',
      attachments: result.attachments?.map(a => ({ name: a.name, path: a.path, contentType: a.contentType })) || [],
      metadata: {
        timestamp,
        commitSha,
        branch,
        duration: result.duration,
        retries: result.retry,
        tags: test.tags || [],
      },
    };

    const filePath = path.join(artifactDir, `${bugId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(bugPackage, null, 2));
    this.failures.push(bugPackage);
  }

  inferCategory(test) {
    const file = test.location?.file || '';
    if (file.includes('analyze')) return 'analysis';
    if (file.includes('pipeline')) return 'pipeline';
    if (file.includes('navigation')) return 'navigation';
    if (file.includes('onboarding')) return 'onboarding';
    if (file.includes('preferences')) return 'preferences';
    return 'general';
  }

  onEnd() {
    if (this.failures.length > 0) {
      console.log(`\n📦 Generated ${this.failures.length} bug package(s) in tests/artifacts/bug-packages/`);
      this.failures.forEach(f => console.log(`  - ${f.severity} | ${f.title}`));
    }
  }
}

export default BugPackageReporter;
```

Now update playwright.config.js — change the reporter array to include this custom reporter:
reporter: [
  ['html', { open: 'never' }],
  ['list'],
  ['./tests/reporters/bug-package-reporter.js'],
],

Create the artifacts directory: tests/artifacts/bug-packages/.gitkeep

Verify the reporter loads without error by running: npx playwright test tests/e2e/navigation.spec.js --reporter=list

Output: confirmation that reporter is registered and functional.

After changes: git add -A && git commit -m "add bug package reporter for automatic failure documentation" && git push
```

---

## Step 7: Add Claude Fix Prompt Generator

### What this builds
A second custom Playwright reporter that reads each bug package and generates a copy-paste-ready Claude Code fix prompt. Every test failure now produces a prompt you can paste directly into Claude Code to fix the bug.

### Why it comes now
Bug packages exist from Step 6. This step converts them from documentation into action — the fix prompt is the last mile between "bug detected" and "bug fixed."

### Expected files created/modified
- `tests/reporters/claude-prompt-reporter.js` (created)
- `playwright.config.js` (modified — add to reporter array)

### Dependencies installed
None.

### Rollback risk
None.

### How to verify
```
# With a failing test:
ls tests/artifacts/claude-prompts/
cat tests/artifacts/claude-prompts/*.md
# Should contain a complete, well-formed Claude Code prompt
```

### Prompt

```
Read tests/reporters/bug-package-reporter.js and playwright.config.js.

Create tests/reporters/claude-prompt-reporter.js — a Playwright reporter that generates Claude Code fix prompts from test failures.

```javascript
import fs from 'fs';
import path from 'path';

class ClaudePromptReporter {
  onEnd() {
    const bugDir = path.join('tests', 'artifacts', 'bug-packages');
    const promptDir = path.join('tests', 'artifacts', 'claude-prompts');
    fs.mkdirSync(promptDir, { recursive: true });

    if (!fs.existsSync(bugDir)) return;

    const bugFiles = fs.readdirSync(bugDir).filter(f => f.endsWith('.json'));
    if (bugFiles.length === 0) return;

    bugFiles.forEach(file => {
      const bug = JSON.parse(fs.readFileSync(path.join(bugDir, file), 'utf-8'));
      const prompt = this.generatePrompt(bug);
      const promptFile = path.join(promptDir, `${bug.id}.md`);
      fs.writeFileSync(promptFile, prompt);
    });

    console.log(`\n🤖 Generated ${bugFiles.length} Claude Code fix prompt(s) in tests/artifacts/claude-prompts/`);
  }

  generatePrompt(bug) {
    const fileHint = this.inferFile(bug);
    const componentHint = this.inferComponent(bug);

    return `Read ${fileHint} carefully. Fix the following bug:

**Bug:** ${bug.title}
**Severity:** ${bug.severity}
**Category:** ${bug.category}

**What happens:**
${bug.actual}

**What should happen:**
The test "${bug.test.fullTitle}" should pass. See test file ${bug.test.file}:${bug.test.line} for the exact assertions.

**Stack trace (if available):**
\`\`\`
${bug.stackTrace || 'No stack trace captured'}
\`\`\`

**Likely location:** ${fileHint}${componentHint ? ` — ${componentHint} component` : ''}

**Requirements:**
- Fix the bug with minimal changes
- Do not refactor surrounding code
- Do not change the test — the test defines correct behavior
- Preserve all existing functionality
- Use existing code patterns (inline styles, useState hooks, Store.get/set for localStorage)

**Acceptance criteria:**
- The failing test passes: npx playwright test ${bug.test.file} --grep "${bug.test.fullTitle.split(' > ').pop()}"
- npm run build still succeeds
- No new console errors

After fix: git add -A && git commit -m "fix: ${bug.title.toLowerCase().slice(0, 60)}" && git push
`;
  }

  inferFile(bug) {
    if (bug.category === 'analysis' || bug.category === 'pipeline' || bug.category === 'navigation' || bug.category === 'onboarding' || bug.category === 'preferences') {
      return 'pages/index.js';
    }
    if (bug.test.file?.includes('api')) return 'pages/api/';
    return 'pages/index.js';
  }

  inferComponent(bug) {
    const map = {
      analysis: 'AnalyzeView',
      pipeline: 'PipelineView',
      navigation: 'Aster (main)',
      onboarding: 'Onboarding',
      preferences: 'PrefsModal',
    };
    return map[bug.category] || null;
  }
}

export default ClaudePromptReporter;
```

Update playwright.config.js reporter array to add this reporter AFTER the bug-package-reporter:
reporter: [
  ['html', { open: 'never' }],
  ['list'],
  ['./tests/reporters/bug-package-reporter.js'],
  ['./tests/reporters/claude-prompt-reporter.js'],
],

Create: tests/artifacts/claude-prompts/.gitkeep

Output: confirmation both reporters are registered.

After changes: git add -A && git commit -m "add Claude Code fix prompt generator from test failures" && git push
```

---

## Step 8: Add GitHub Actions CI Pipeline

### What this builds
GitHub Actions workflow that runs lint, unit tests, and critical E2E tests on every pull request. Uploads failure artifacts (bug packages, Claude prompts, traces) when tests fail.

### Why it comes now
All test infrastructure is built. CI is the mechanism that runs tests automatically so you never have to remember to run them manually.

### Expected files created/modified
- `.github/workflows/pr-checks.yml` (created)
- `.github/workflows/nightly-regression.yml` (created)

### Dependencies installed
None.

### Rollback risk
None. Only adds workflow files. Does not affect existing deploy process.

### How to verify
```
# Push to a new branch, open a PR, watch Actions tab
git checkout -b test-ci
git commit --allow-empty -m "test CI"
git push -u origin test-ci
# Open PR on GitHub, verify checks run
```

### Prompt

```
Read package.json, vitest.config.js, and playwright.config.js.

Create .github/workflows/pr-checks.yml:

```yaml
name: PR Checks
on:
  pull_request:
    branches: [main]

concurrency:
  group: pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint

  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx vitest run --reporter=verbose

  e2e-critical:
    name: E2E Critical Path
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test --grep @critical --project=chromium
        env:
          CI: true
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: e2e-failure-artifacts
          path: |
            tests/artifacts/
            test-results/
            playwright-report/
          retention-days: 7
```

Create .github/workflows/nightly-regression.yml:

```yaml
name: Nightly Regression
on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:

jobs:
  full-regression:
    name: Full E2E Regression
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx vitest run
      - run: npx playwright test --retries=2
        env:
          CI: true
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: nightly-report-${{ github.run_number }}
          path: |
            tests/artifacts/
            test-results/
            playwright-report/
          retention-days: 30
```

Verify both YAML files are valid by checking syntax.

After changes: git add -A && git commit -m "add GitHub Actions CI: PR checks and nightly regression" && git push
```

---

## Step 9: Add Visual Regression Tests

### What this builds
Screenshot-based tests that capture baseline images of every major view and compare against them on future runs. Any unintended visual change is caught automatically.

### Why it comes now
Functional tests are in place. Visual regression catches a different class of bugs — layout shifts, missing elements, color changes — that functional tests miss.

### Expected files created/modified
- `tests/visual/views.spec.js` (created)
- `tests/visual/views.spec.js-snapshots/` (created on first run — baseline screenshots)

### Dependencies installed
None (Playwright has built-in screenshot comparison).

### Rollback risk
None. Baselines can be regenerated with `npx playwright test --update-snapshots`.

### How to verify
```
npx playwright test tests/visual/ --project=chromium
# First run creates baselines. Second run compares. Both should pass.
```

### Prompt

```
Read pages/index.js and tests/helpers/setup-storage.js.

Create tests/visual/views.spec.js — visual regression tests using Playwright's built-in screenshot comparison.

```javascript
import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
```

For every test:
- Mock /api/claude and /api/infer-prefs routes to prevent real API calls
- Use page.route('/api/claude', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '{}' }] }) }))
- Wait for page to be fully loaded before screenshot

Tests:

1. "Dashboard view matches baseline" — setupStorage with with-5-jobs (but mock the nextActions API call to return a fixed response so the dashboard is deterministic). Mock the /api/claude route to return a fixed nextActions JSON: { todayTasks: [{ priority: 1, task: "Follow up with Oscar Health", company: "Oscar Health", type: "follow-up" }], insight: "Focus on your strongest pipeline opportunities", warning: null, weeklyFocus: "Close the Oscar Health lead" }. Navigate to dashboard. Take screenshot. Use toHaveScreenshot('dashboard.png', { maxDiffPixelRatio: 0.02 }).

2. "Analyze view matches baseline" — setupStorage with onboarded-no-jobs. Navigate to analyze. Screenshot.

3. "Pipeline view matches baseline" — setupStorage with with-5-jobs. Navigate to pipeline. Screenshot.

4. "Strategy view matches baseline" — setupStorage with onboarded-no-jobs. Navigate to strategy. Screenshot.

5. "Resume view (empty state) matches baseline" — setupStorage with empty fixture (but set aster_onboarded to true). Navigate to workshop. Screenshot.

6. "Preferences modal matches baseline" — setupStorage with onboarded-no-jobs. Click Prefs button. Wait for modal. Screenshot the modal area.

On first run, these will create baseline screenshots. Commit the snapshots directory.

IMPORTANT: Set a fixed viewport size in each test: page.setViewportSize({ width: 1280, height: 720 }). This ensures consistent screenshots across environments.

After changes: 
1. Run: npx playwright test tests/visual/ --project=chromium --update-snapshots
2. git add -A && git commit -m "add visual regression tests with baselines" && git push
```

---

## Step 10: Add Accessibility Tests and Production Smoke

### What this builds
Accessibility audits using axe-core for every major view, plus a production smoke test that verifies the live site works after deploy.

### Why it comes last
This is the polish layer. Functional and visual coverage are in place. Accessibility and production smoke provide the final safety nets.

### Expected files created/modified
- `tests/a11y/audit.spec.js` (created)
- `tests/e2e/production-smoke.spec.js` (created)

### Dependencies installed
None (@axe-core/playwright was installed in Step 1).

### Rollback risk
None.

### How to verify
```
npx playwright test tests/a11y/ --project=chromium
npx playwright test tests/e2e/production-smoke.spec.js --project=chromium
```

### Prompt

```
Read pages/index.js and tests/helpers/.

Create tests/a11y/audit.spec.js — accessibility tests using @axe-core/playwright:

```javascript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
```

Before each test: mock /api/claude to return an empty response. Setup storage with onboarded-no-jobs fixture.

Tests:
1. "Dashboard has no critical accessibility violations" — navigate to dashboard. Run AxeBuilder. Filter for impact 'critical' or 'serious'. Assert violations array length is 0. If violations exist, log each violation's id, impact, description, and first 2 affected nodes.
2. "Analyze view has no critical violations" — same pattern.
3. "Pipeline view has no critical violations" — use with-5-jobs fixture.
4. "Preferences modal has no critical violations" — open prefs modal, then audit.
5. "Onboarding has no critical violations" — use empty fixture, audit the welcome screen.

For each test, if violations are found, fail with a message that lists each violation clearly:
```javascript
const violations = results.violations.filter(v => ['critical', 'serious'].includes(v.impact));
const messages = violations.map(v => `${v.impact}: ${v.id} - ${v.description} (${v.nodes.length} nodes)`);
expect(violations, `Accessibility violations:\n${messages.join('\n')}`).toHaveLength(0);
```

Create tests/e2e/production-smoke.spec.js:

```javascript
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
```

This smoke test uses BASE_URL env var so it can run against production or staging.

Run both:
npx playwright test tests/a11y/ --project=chromium
npx playwright test tests/e2e/production-smoke.spec.js --project=chromium

Output: test counts, pass/fail, and any accessibility violations found (these are informational — do not fail the build on moderate/minor a11y issues, only on critical/serious).

After changes: git add -A && git commit -m "add accessibility audits and production smoke tests" && git push
```

---

## Summary: The Complete Sequence

| Step | What | Time | Risk |
|------|------|------|------|
| 1 | Install test framework | 5 min | None |
| 2 | Extract pure functions | 10 min | Low — pure refactor |
| 3 | Write unit tests | 15 min | None |
| 4 | Create fixtures & helpers | 10 min | None |
| 5 | Write E2E tests | 20 min | None |
| 6 | Bug package reporter | 10 min | None |
| 7 | Claude prompt generator | 10 min | None |
| 8 | GitHub Actions CI | 5 min | None |
| 9 | Visual regression | 10 min | None |
| 10 | Accessibility + smoke | 10 min | None |

**Total estimated time: ~2 hours of Claude Code prompting**

After all 10 steps you will have:
- 20+ unit tests covering core business logic
- 15+ E2E tests covering all critical user flows
- 6 visual regression baselines
- 5 accessibility audits
- 4 production smoke checks
- Automatic bug package generation on every failure
- Automatic Claude Code fix prompt generation on every failure
- CI running on every PR and nightly
- Zero manual test steps required
