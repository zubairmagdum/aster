# AsterCopilot Workflow E2E Test Suite

Replaces Step 5 of QA_PLAYBOOK.md with workflow-first, journey-driven E2E coverage.

---

## Top 10 Workflow Journeys

These are the real multi-step user journeys through AsterCopilot, identified from reading every component, every state transition, and every API call in pages/index.js.

### W1. First-Time User: Onboard → Resume → Prefs Auto-Configured → Dashboard
**The "day one" journey.** New user arrives, uploads resume, system infers preferences, user lands on dashboard ready to search.

Steps:
1. Fresh load (empty localStorage) → onboarding welcome screen renders
2. Click "Get started" → upload step appears
3. Trigger resume upload (mock /api/parse-resume to return text) → resume filename shows, "Resume loaded" toast
4. /api/infer-prefs fires automatically → "Reading your background..." pulse appears
5. Mock returns inferred prefs → "Preferences configured" text appears, "Preferences set from your resume" toast
6. Click "Continue" → email step
7. Click "Skip — go to app" → main app loads with dashboard
8. Verify: nav tabs visible, dashboard renders, health indicator shows STUCK (no applications)
9. Click Prefs → modal opens, inferred banner shows "auto-detected from your resume"
10. Verify: minSalary, workMode, targetIndustries populated from inference

**Persistence check:** Reload page → skip onboarding, dashboard still renders, prefs still set.

---

### W2. Analyze JD → Save to Pipeline → Verify Dashboard Updates
**The core value loop.** User pastes a job, gets AI analysis, saves it, and sees pipeline/dashboard reflect the new job.

Steps:
1. Start from onboarded state with resume, no jobs
2. Navigate to Analyze tab
3. Paste 200+ word JD into textarea → auto-extract fires (mock /api/claude for extractJD, return {company:"Acme", role:"Sr Engineer"})
4. Company and role fields auto-populate
5. Click "Analyze with Aster AI" → spinner shows
6. Mock /api/claude returns full analysis response → results panel appears
7. Verify: verdict card shows verdict text, fit score ring renders with number, match score renders
8. Verify: strengths list has 3 items, gaps list has 2 items
9. Click "ATS Keywords" tab → keywords render, click one → "Copied" toast
10. Click "Resume Tailoring" tab → tailored summary and bullets render
11. Select "Applied" from save-as options, click save → "Acme saved as Applied" toast
12. Navigate to Pipeline → "Acme" appears in job list with "Applied" status chip and fit score
13. Navigate to Dashboard → Tracked count is 1, Applied count is 1
14. Verify: health indicator changes from STUCK to SLOW or ACTIVE

**Persistence check:** Reload → Acme still in pipeline, dashboard counts preserved.

---

### W3. Hard Skip Detection → Override → Analyze Anyway
**Validates the domain exclusion guard rail and its override.**

Steps:
1. Start onboarded with prefs.excludedIndustries: ["Gaming"]
2. Navigate to Analyze
3. Paste JD containing "video game studio" and "esports platform"
4. Verify: hard skip banner appears with "Domain excluded: Gaming"
5. Verify: "You can still analyze if you want to override" text
6. Fill company/role manually
7. Click analyze anyway → analysis runs normally (mock API)
8. Verify: results render despite hard skip warning
9. Save to pipeline → job appears in pipeline

---

### W4. Pipeline Management: Filter → Select → Bulk Update → Export → Verify
**Full pipeline CRUD workflow.**

Steps:
1. Start with 5 jobs in varied statuses (fixture)
2. Navigate to Pipeline → all 5 jobs render
3. Click "Applied" filter pill → only Applied jobs visible (2 jobs)
4. Click "Select All" → "2 of 2 selected" shows
5. Change bulk dropdown to "Recruiter Screen", click Apply → toast "Updated 2 jobs"
6. Click "All" filter → verify those 2 jobs now show "Recruiter Screen"
7. Expand one job → detail panel opens with STATUS dropdown, date, resume version
8. Change status via dropdown to "HM Interview" → status chip updates immediately
9. Click "Export CSV" → download triggers, file contains all 5 jobs
10. Click one job's remove button → job disappears, count drops to 4

**Persistence check:** Reload → 4 jobs remain, statuses preserved.

---

### W5. Import History: CSV → Pipeline → Dashboard Reflects Imported Data
**Tests the data ingestion path for historical applications.**

Steps:
1. Start onboarded with 0 jobs
2. Navigate to Pipeline → empty state shows "No roles here yet"
3. Click "Import History" → modal opens
4. Select "Paste CSV" tab
5. Paste: `Company,Role,Date Applied,Outcome,Notes\nStripe,Sr PM,2025-06-01,No Response,\nNotion,PM,2025-05-15,Rejected,Generic`
6. Click Parse → "2 jobs parsed" text appears
7. Click "Import 2 jobs" → toast "Imported 2 jobs to pipeline", modal closes
8. Verify: Stripe and Notion appear in pipeline list
9. Verify: Stripe has status "Applied" (mapped from "No Response"), Notion has "Rejected"
10. Switch to "Bulk Paste" tab via Import History → paste `Figma | Designer | Applied | 2025-07-01`
11. Parse → Import → Figma appears in pipeline (3 total)
12. Navigate to Dashboard → Tracked shows 3

**Persistence check:** Reload → 3 jobs still in pipeline.

---

### W6. Outreach: Select Job → Get Strategy → Generate Message → Copy
**Tests the contact strategy and message generation workflow.**

Steps:
1. Start with 5 jobs, navigate to Outreach
2. Job sidebar shows all 5 jobs
3. Click first job (Stripe) → header shows "Stripe" / "Senior PM, Payments"
4. Click "Get Strategy" → spinner, mock /api/claude returns contact strategy
5. Verify: tiers render (T1, T2), org note text, path steps
6. Click "Generate →" on first tier persona → mock /api/claude returns message variants
7. Verify: 3 variant tabs appear (Proof-led, Question-led, Value-led)
8. Click "Proof-led" tab → message text renders
9. Click "Copy" → "Copied!" toast
10. Verify: follow-up sequence renders with Day 3 and Day 7 messages
11. Click "+ Add Contact" → form appears, fill name/title, click Save → contact appears in list

---

### W7. Strategy Hub: Input → Generate Brief → Persist → Reload
**Tests the strategy planning workflow.**

Steps:
1. Start onboarded with 5 jobs
2. Navigate to Strategy tab
3. Fill "Target role in 90 days" input with "Staff PM at Series B AI company"
4. Fill "What's been working" textarea
5. Fill "What's not working" textarea
6. Click "Generate Weekly Brief" → spinner, mock /api/claude returns brief
7. Verify: 4 sections render (Weekly Focus, Double Down, Stop Doing, Encouragement)
8. Reload page → navigate back to Strategy
9. Verify: all 3 inputs still populated (localStorage auto-save)
10. Verify: brief still rendered (restored from aster_strategy_brief)

---

### W8. Resume Workshop: Analyze → Get Versions → Recommend for JD
**Tests the resume positioning workflow.**

Steps:
1. Start onboarded with resume text
2. Navigate to Resume tab
3. Click "Analyze My Resume" → spinner, mock /api/claude returns 3 versions
4. Verify: 3 version cards render with labels, target roles tags, target companies tags, lead-with bullets
5. Verify: versions persist — reload, navigate back, cards still there
6. Scroll to "Which version for this JD?" section
7. Paste JD snippet into textarea
8. Click "Recommend" → mock /api/claude returns recommendation
9. Verify: recommended version label and reason render inline

**Edge case:** Navigate to Resume tab with NO resume text → empty state renders: "Upload your resume first"

---

### W9. Interview Prep: Advance Job → Prep Modal → Cached Reopen
**Tests the interview preparation workflow tied to pipeline status.**

Steps:
1. Start with 5 jobs, one at "HM Interview" status (Oscar Health in fixture)
2. Navigate to Pipeline
3. Expand Oscar Health job → detail panel shows "Interview Prep" button
4. Click "Interview Prep" → spinner in button, mock /api/claude returns prep data
5. Modal opens with "Interview Prep" heading, "Oscar Health" company
6. Verify: 5 questions render, each with question text and STAR story
7. Verify: 3 "Research Before the Interview" items render
8. Close modal (click X)
9. Click "Interview Prep" again on same job → modal opens IMMEDIATELY (no spinner, cached)
10. Verify: same questions render from cache, no API call made

**Edge case:** Jobs in "Saved" or "Applied" status do NOT show the Interview Prep button.

---

### W10. Preferences: Configure → Hard Skip Reflects → Analysis Uses Prefs
**End-to-end prefs workflow: change settings, verify they propagate everywhere.**

Steps:
1. Start onboarded, navigate to Prefs
2. Set minSalary to 200 (=$200K), set workMode to Remote, toggle "Cybersecurity" exclusion ON
3. Click Save → toast "Preferences saved", modal closes
4. Navigate to Analyze
5. Paste JD containing "cybersecurity" and "penetration testing" → hard skip banner appears with "Domain excluded: Cybersecurity"
6. Paste different JD with salary "$80k - $120k" → hard skip shows salary warning
7. Analyze a clean JD (mock response with estimatedCompRange "$150K - $180K") → save to pipeline
8. Verify: comp range tag renders on verdict card, colored gold (below $200K target)
9. Open Prefs again → salary shows 200, Remote highlighted, Cybersecurity pill highlighted

**Persistence check:** Reload → reopen Prefs → all settings still set.

---

## Spec Files to Create

| File | Workflows | PR or Nightly |
|---|---|---|
| `tests/e2e/wf-onboarding.spec.js` | W1 | PR (@critical) |
| `tests/e2e/wf-analyze-to-pipeline.spec.js` | W2, W3 | PR (@critical) |
| `tests/e2e/wf-pipeline-management.spec.js` | W4 | PR (@critical) |
| `tests/e2e/wf-import-export.spec.js` | W5 | PR (@critical) |
| `tests/e2e/wf-outreach.spec.js` | W6 | Nightly |
| `tests/e2e/wf-strategy.spec.js` | W7 | Nightly |
| `tests/e2e/wf-resume-workshop.spec.js` | W8 | Nightly |
| `tests/e2e/wf-interview-prep.spec.js` | W9 | Nightly |
| `tests/e2e/wf-preferences-propagation.spec.js` | W10 | PR (@critical) |
| `tests/e2e/wf-persistence.spec.js` | Cross-cutting refresh checks | Nightly |

---

## Required Fixtures and Mocks

### localStorage Fixtures (already created in Step 4, augmented here)

| Fixture | Contents | Used by |
|---|---|---|
| `empty.json` | `{}` | W1 |
| `onboarded-no-jobs.json` | Onboarded, resume, prefs, 0 jobs | W2, W3, W7, W8, W10 |
| `with-5-jobs.json` | Onboarded, resume, prefs, 5 jobs | W4, W5, W6, W9 |
| `onboarded-no-resume.json` | Onboarded, no resume text, 0 jobs | W8 edge case |

### New fixture needed: `tests/fixtures/localStorage/onboarded-no-resume.json`
```json
{
  "aster_onboarded": true,
  "aster_resume": "",
  "aster_resume_name": "",
  "aster_jobs": [],
  "aster_contacts": [],
  "aster_profile": {},
  "aster_prefs": { ... DEFAULT_PREFS ... }
}
```

### API Mock Responses (in tests/fixtures/api-responses/)

| Mock File | Shape | Used by |
|---|---|---|
| `analyze-success.json` | Full analysis result | W2, W3, W10 |
| `extract-jd-success.json` | `{company:"Acme",role:"Sr Engineer"}` | W2 |
| `infer-prefs-success.json` | Full inferred prefs result | W1 |
| `contact-strategy.json` | Strategy tiers + path | W6 |
| `outreach-messages.json` | Variants + followups | W6 |
| `next-actions.json` | Today tasks + insight | W2 (dashboard) |
| `strategy-brief.json` | Weekly brief result | W7 |
| `resume-versions.json` | 3 resume versions | W8 |
| `resume-recommend.json` | `{recommended, reason}` | W8 |
| `interview-prep.json` | Questions + research | W9 |
| `parse-resume-success.json` | `{text: "...resume..."}` | W1 |

### Mock Routing Strategy

Every spec file intercepts ALL API routes at the top of beforeEach:

```javascript
// Block real API calls, return mocks based on prompt content
await page.route('/api/claude', async (route, request) => {
  const body = JSON.parse(request.postData());
  const prompt = body.messages?.[0]?.content || '';

  let response;
  if (prompt.includes('Extract the company name')) response = extractJdFixture;
  else if (prompt.includes('expert recruiter')) response = analyzeFixture;
  else if (prompt.includes('contact strategy')) response = contactStrategyFixture;  
  else if (prompt.includes('outreach')) response = outreachFixture;
  else if (prompt.includes('next actions') || prompt.includes('job search coach')) response = nextActionsFixture;
  else if (prompt.includes('weekly strategic brief')) response = strategyBriefFixture;
  else if (prompt.includes('positioning angles')) response = resumeVersionsFixture;
  else if (prompt.includes('which version')) response = resumeRecommendFixture;
  else if (prompt.includes('interview coach')) response = interviewPrepFixture;
  else response = {};

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(response) }] }),
  });
});

await page.route('/api/parse-resume', async route => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ text: 'Jane Smith — Senior Product Manager...' }),
  });
});

await page.route('/api/infer-prefs', async route => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(inferPrefsFixture),
  });
});
```

---

## PR vs Nightly Assignment

### PR Checks (run on every pull request, must pass to merge)
Tagged `@critical`. These cover the workflows that would block a user from using the product:

- **W1** (onboarding) — Can new users get in?
- **W2** (analyze → pipeline) — Can users analyze jobs?
- **W3** (hard skip) — Do guard rails work?
- **W4** (pipeline management) — Can users manage their data?
- **W5** (import/export) — Can users move data in/out?
- **W10** (preferences propagation) — Do settings take effect?

**Estimated PR time: ~90 seconds on Chromium**

### Nightly Regression (runs daily at 6am UTC)
Covers the AI-heavy workflows that are less likely to break from UI changes:

- **W6** (outreach) — Multi-step AI generation
- **W7** (strategy) — AI brief generation + persistence
- **W8** (resume workshop) — AI resume analysis + recommendation
- **W9** (interview prep) — AI prep + caching
- **W10** (persistence) — Cross-cutting reload verification across all views

**Estimated nightly time: ~3 minutes on Chromium**

---

## Copy/Paste Claude Code Prompts

### Prompt A: Create mock fixtures for all API responses

```
Read pages/index.js. Search for every callClaude() call and every fetch('/api/...') call. For each one, identify the expected response shape from the JSON.parse that follows.

Create these fixture files with realistic mock data:

1. tests/fixtures/api-responses/extract-jd-success.json:
{"company":"Acme Corp","role":"Senior Software Engineer"}

2. tests/fixtures/api-responses/analyze-success.json:
A complete analysis result matching the JSON schema in PROMPTS.analyze. Include:
fitScore: 78, matchScore: 65, verdict: "Apply with Tailoring", verdictReason: "Strong platform experience but domain gap in observability", strengths: 3 items, gaps: 2 items, transferability: {score: 72, reason: "Platform engineering skills transfer directly", angle: "Lead with API design experience"}, atsKeywords: 5 items, tailoredSummary: 2 sentences, tailoredBullets: 3 items each with bullet/job/action/replaces, nextAction: a specific action, resumeRecommendation: {version: null, reason: "Visit Resume tab to generate positioning angles"}, estimatedCompRange: "$165K - $210K", perksFound: ["Equity/stock options", "Remote work"], perksMatch: "Good match", compWarning: null, roleDNA: all fields filled realistically.

3. tests/fixtures/api-responses/infer-prefs-success.json:
{inferredTargetIndustries: ["SaaS", "AI/ML", "Fintech"], inferredExcludedIndustries: ["Gaming", "Defense & Military"], inferredMinSalary: 175000, inferredMaxSalary: 250000, hasPeopleManagement: false, seniorityLevel: "Senior", workMode: "Remote", confidence: "high", summary: "Senior product manager with 7 years in platform and growth roles at Stripe and Airbnb"}

4. tests/fixtures/api-responses/contact-strategy.json:
{tiers: [{tier:1, persona:"Hiring Manager", titles:["Director of Engineering","VP Engineering"], why:"Direct decision maker", channel:"LinkedIn DM"}, {tier:1, persona:"Internal Recruiter", titles:["Technical Recruiter"], why:"Controls screening", channel:"LinkedIn Connect"}, {tier:2, persona:"Team Lead", titles:["Staff Engineer"], why:"Can refer or give intel", channel:"LinkedIn Connect"}], path:["Find hiring manager on LinkedIn","Send connect note with proof point","Follow up after 3 days"], orgNote:"Engineering org likely reports to VP Eng. Team size ~15-20."}

5. tests/fixtures/api-responses/outreach-messages.json:
{variants: [{label:"Proof-led", message:"Hi [Name], I noticed Acme is scaling its platform team...", hook:"scaling platform team"}, {label:"Question-led", message:"Hi [Name], curious how Acme thinks about...", hook:"API developer experience"}, {label:"Value-led", message:"Hi [Name], I helped scale Stripe's...", hook:"Stripe platform scale"}], followups: [{day:3, message:"Following up on my note about..."}, {day:7, message:"Last note — would love to chat about..."}]}

6. tests/fixtures/api-responses/next-actions.json:
{todayTasks: [{priority:1, task:"Follow up with Oscar Health recruiter", company:"Oscar Health", type:"follow-up"}, {priority:2, task:"Research Anthropic's API product strategy", company:"Anthropic", type:"research"}], insight:"Your strongest pipeline opportunity is Anthropic — prioritize prep for that application", warning:null, weeklyFocus:"Close the Oscar Health lead and submit Anthropic application"}

7. tests/fixtures/api-responses/strategy-brief.json:
{weeklyFocus: "Submit 3 applications to AI-native companies this week", doubleDown: "Referral-based applications are getting 3x the response rate — keep leveraging your network", stop: "Stop applying to roles more than 2 levels below your seniority — they auto-reject overqualified candidates", encouragement: "You are making steady progress. Two active conversations is better than most job seekers at this stage."}

8. tests/fixtures/api-responses/resume-versions.json:
{versions: [{label:"Platform Engineering", targetRoles:["Sr PM, Platform","Staff PM, Infrastructure"], targetCompanies:["Stripe","Datadog","Cloudflare"], coreStrength:"Built and scaled API platforms serving 10K+ developers", leadWith:["Stripe API platform launch","Developer experience metrics"], deemphasize:["Consumer growth work"]}, {label:"AI Product", targetRoles:["PM, AI/ML","Sr PM, Applied AI"], targetCompanies:["Anthropic","OpenAI","Cohere"], coreStrength:"Shipped ML-powered features with measurable business impact", leadWith:["ML model integration at Airbnb","A/B testing infrastructure"], deemphasize:["Healthcare domain work"]}, {label:"Growth & Lifecycle", targetRoles:["PM, Growth","Sr PM, Lifecycle"], targetCompanies:["Notion","Figma","Linear"], coreStrength:"Drove 40% activation improvement through experimentation", leadWith:["Airbnb guest activation","Lifecycle email optimization"], deemphasize:["Enterprise platform work"]}]}

9. tests/fixtures/api-responses/resume-recommend.json:
{recommended: "Platform Engineering", reason: "This JD emphasizes API design, developer tooling, and multi-tenant architecture which maps directly to your Platform Engineering angle."}

10. tests/fixtures/api-responses/interview-prep.json:
{questions: [{question:"Tell me about a time you launched a product from zero to one.", starStory:"At Stripe, I led the launch of the Connect Express onboarding flow..."}, {question:"How do you prioritize when you have competing stakeholder demands?", starStory:"At Airbnb, I managed competing requests from growth and trust teams..."}, {question:"Describe a technical decision you made that had significant business impact.", starStory:"I chose to rebuild the API rate limiter at Stripe..."}, {question:"How do you work with engineering teams on technical trade-offs?", starStory:"At Airbnb, I facilitated a build-vs-buy decision..."}, {question:"What metrics would you use to measure success for this product?", starStory:"For the payments platform at Stripe, I established..."}], research:["Review Acme's recent product launches and blog posts","Understand their competitive positioning vs. alternatives","Research the hiring manager's background and past companies"]}

11. tests/fixtures/api-responses/parse-resume-success.json:
{text: "Jane Smith — Senior Product Manager with 7 years experience. Led platform products at Stripe (2020-2024) and growth products at Airbnb (2017-2020). Skills: product strategy, A/B testing, SQL, cross-functional leadership, 0-to-1 launches. Education: MBA Stanford, BS Computer Science MIT."}

12. tests/fixtures/localStorage/onboarded-no-resume.json:
Same as onboarded-no-jobs.json but with aster_resume set to "" and aster_resume_name set to "".

After changes: git add -A && git commit -m "add comprehensive API mock fixtures for workflow E2E tests" && git push
```

---

### Prompt B: Create shared mock routing helper

```
Read the fixture files in tests/fixtures/api-responses/. Create a shared helper that sets up all API route mocking for E2E tests.

Create tests/helpers/mock-api.js:

```javascript
import fs from 'fs';
import path from 'path';

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'api-responses', `${name}.json`), 'utf-8'));
}

export async function mockAllApiRoutes(page, overrides = {}) {
  const fixtures = {
    extractJd: overrides.extractJd || loadFixture('extract-jd-success'),
    analyze: overrides.analyze || loadFixture('analyze-success'),
    inferPrefs: overrides.inferPrefs || loadFixture('infer-prefs-success'),
    contactStrategy: overrides.contactStrategy || loadFixture('contact-strategy'),
    outreachMessages: overrides.outreachMessages || loadFixture('outreach-messages'),
    nextActions: overrides.nextActions || loadFixture('next-actions'),
    strategyBrief: overrides.strategyBrief || loadFixture('strategy-brief'),
    resumeVersions: overrides.resumeVersions || loadFixture('resume-versions'),
    resumeRecommend: overrides.resumeRecommend || loadFixture('resume-recommend'),
    interviewPrep: overrides.interviewPrep || loadFixture('interview-prep'),
    parseResume: overrides.parseResume || loadFixture('parse-resume-success'),
  };

  await page.route('/api/claude', async (route, request) => {
    const body = JSON.parse(request.postData());
    const prompt = body.messages?.[0]?.content || '';

    let response;
    if (prompt.includes('Extract the company name')) response = fixtures.extractJd;
    else if (prompt.includes('expert recruiter')) response = fixtures.analyze;
    else if (prompt.includes('contact strategy') || prompt.includes('recruiting strategist')) response = fixtures.contactStrategy;
    else if (prompt.includes('outreach') || prompt.includes('high-converting professional')) response = fixtures.outreachMessages;
    else if (prompt.includes('job search coach') || prompt.includes('what to do next')) response = fixtures.nextActions;
    else if (prompt.includes('weekly strategic brief') || prompt.includes('job search strategist')) response = fixtures.strategyBrief;
    else if (prompt.includes('positioning angles') || prompt.includes('career strategist')) response = fixtures.resumeVersions;
    else if (prompt.includes('which version')) response = fixtures.resumeRecommend;
    else if (prompt.includes('interview coach')) response = fixtures.interviewPrep;
    else response = {};

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(response) }] }),
    });
  });

  await page.route('/api/parse-resume', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixtures.parseResume),
    });
  });

  await page.route('/api/infer-prefs', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixtures.inferPrefs),
    });
  });
}
```

This helper:
- Loads all fixtures from disk
- Allows per-test overrides via the overrides parameter
- Routes /api/claude calls to the right fixture based on prompt content
- Routes /api/parse-resume and /api/infer-prefs directly

After changes: git add -A && git commit -m "add shared API mock routing helper for E2E tests" && git push
```

---

### Prompt C: Write W1 + W2 workflow specs (PR-critical)

```
Read pages/index.js, tests/helpers/setup-storage.js, tests/helpers/navigate-to.js, tests/helpers/mock-api.js, and all fixture files.

Create tests/e2e/wf-onboarding.spec.js implementing Workflow W1:

```javascript
import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';
```

Test: "W1: First-time user onboard → resume → prefs auto-configured → dashboard" { tag: '@critical' }

Steps:
1. setupStorage(page, 'empty') — fresh user
2. mockAllApiRoutes(page)
3. await page.goto('/')
4. Expect: text "Land the job" is visible (onboarding welcome)
5. Click button with text "Get started"
6. Expect: text "Upload your resume" visible
7. Since we cannot programmatically trigger a file upload in the upload zone easily, click "Skip for now" to go to email step
8. Click "Skip — go to app"
9. Expect: nav button "Dashboard" is visible — user is in the app
10. Expect: text containing "STUCK" is visible (health indicator, 0 applications)

Test: "W1: onboarded user skips directly to app" { tag: '@critical' }
1. setupStorage(page, 'onboarded-no-jobs')
2. mockAllApiRoutes(page)
3. goto('/')
4. Expect: "Land the job" is NOT visible
5. Expect: button "Dashboard" is visible

Test: "W1: inferred prefs banner shows in Prefs modal" { tag: '@critical' }
1. setupStorage with onboarded-no-jobs BUT set aster_prefs to include prefsInferred:true, inferredSummary:"Senior PM with platform experience"
2. mockAllApiRoutes(page)
3. goto('/'), click Prefs button
4. Expect: text "auto-detected from your resume" visible
5. Expect: text "We read you as:" visible

Create tests/e2e/wf-analyze-to-pipeline.spec.js implementing Workflows W2 and W3:

Test: "W2: paste JD → analyze → save to pipeline → dashboard updates" { tag: '@critical' }

Steps:
1. setupStorage(page, 'onboarded-no-jobs')
2. mockAllApiRoutes(page)
3. goto('/'), click "Analyze" nav
4. Fill textarea with a realistic 200-word JD (hardcode a sample JD string in the test)
5. Fill company input: "Acme Corp"
6. Fill role input: "Senior Engineer"
7. Click button containing "Analyze with Aster AI"
8. Wait for results: expect text "Apply with Tailoring" to be visible (from mock)
9. Expect: a score ring with "78" is visible (fitScore from mock)
10. Click tab "ATS Keywords" — expect at least 3 keyword tags
11. Click tab "Resume Tailoring" — expect "Tailored Summary" section label
12. Select "Applied" from save-as buttons, click save button containing "Save to pipeline"
13. Expect: toast with "Acme Corp saved" 
14. Click "Pipeline" nav
15. Expect: text "Acme Corp" visible in pipeline
16. Click "Dashboard" nav  
17. Expect: stat card with "1" for Tracked

Test: "W3: hard skip detection and override" { tag: '@critical' }

Steps:
1. setupStorage with onboarded-no-jobs (has excludedIndustries: ["Gaming"])
2. mockAllApiRoutes(page)
3. goto('/'), click "Analyze"
4. Fill textarea with JD containing "We are a video game studio building next-generation esports platform experiences"
5. Expect: text "Hard Skip Detected" visible
6. Expect: text "Domain excluded: Gaming" visible
7. Fill company "GameCo", role "PM"
8. Click analyze button — analysis still runs
9. Expect: verdict card visible (mocked response)

Test: "W2: persistence after refresh" { tag: '@critical' }

1. After running W2 test above (job saved), reload page
2. Click Pipeline nav
3. Expect: "Acme Corp" still visible

For the sample JD, use this hardcoded string:
const SAMPLE_JD = `We are looking for a Senior Software Engineer to join our platform team. You will design and build scalable APIs, work with distributed systems, and collaborate with product managers to ship features that serve millions of users. Requirements: 5+ years of software engineering experience, strong knowledge of Python or Go, experience with cloud infrastructure (AWS/GCP), familiarity with CI/CD pipelines. Nice to have: experience with Kubernetes, observability tools, API gateway design. We offer competitive compensation, equity, remote work, and unlimited PTO.`;

After changes: git add -A && git commit -m "add workflow E2E tests: onboarding (W1) and analyze-to-pipeline (W2/W3)" && git push
```

---

### Prompt D: Write W4 + W5 workflow specs (PR-critical)

```
Read pages/index.js, tests/helpers/setup-storage.js, tests/helpers/navigate-to.js, tests/helpers/mock-api.js, and tests/fixtures/localStorage/with-5-jobs.json.

Create tests/e2e/wf-pipeline-management.spec.js implementing Workflow W4:

```javascript
import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';
```

All tests tagged { tag: '@critical' }.

test.beforeEach: setupStorage(page, 'with-5-jobs'), mockAllApiRoutes(page), goto('/'), navigateTo(page, 'pipeline')

Test: "W4: all jobs render in pipeline"
- Count elements containing company names from fixture (Stripe, Oscar Health, Anthropic, Datadog, Calm)
- Assert 5 job cards visible

Test: "W4: filter pills filter by status"
- Click "Applied" filter button (find by text "Applied")
- Assert only 2 company names visible (Stripe, Datadog — both Applied in fixture)
- Click "All" to reset

Test: "W4: select all and bulk update"
- Click "Select All" button
- Expect: text "5 of 5 selected" visible
- Select "Recruiter Screen" from the bulk status dropdown
- Click "Apply" button inside the bulk bar
- Expect: toast text containing "Updated 5 jobs"

Test: "W4: expand job shows detail"
- Click on text "Stripe" to expand
- Expect: STATUS label and select dropdown visible
- Expect: DATE ADDED label visible

Test: "W4: export CSV triggers download"
- Set up download promise: const downloadPromise = page.waitForEvent('download')
- Click "Export CSV" button
- const download = await downloadPromise
- Assert: download.suggestedFilename() contains "aster-pipeline"

Test: "W4: remove job"
- Click "Stripe" to expand
- Click "Remove" button
- Expect: "Stripe" is no longer visible
- Count remaining jobs: 4

Create tests/e2e/wf-import-export.spec.js implementing Workflow W5:

test.beforeEach: setupStorage(page, 'onboarded-no-jobs'), mockAllApiRoutes(page), goto('/'), navigateTo(page, 'pipeline')

Test: "W5: empty pipeline shows empty state" { tag: '@critical' }
- Expect: text "No roles here yet" visible

Test: "W5: CSV import with header row" { tag: '@critical' }
- Click "Import History"
- Expect: modal heading "Import Past Applications" visible
- Fill CSV textarea with: "Company,Role,Date Applied,Outcome,Notes\nStripe,Sr PM,2025-06-01,No Response,\nNotion,PM,2025-05-15,Rejected,Generic rejection"
- Click "Parse" button
- Expect: text "2 jobs parsed" visible
- Click button containing "Import 2 jobs"
- Expect: toast "Imported 2 jobs"
- Expect: modal closed (heading no longer visible)
- Expect: "Stripe" and "Notion" visible in pipeline

Test: "W5: bulk paste import" { tag: '@critical' }
- Click "Import History"
- Click "Bulk Paste" tab
- Fill textarea with: "Figma | Designer | Applied | 2025-07-01\nLinear | PM | Saved | 2025-07-02"
- Click "Parse"
- Expect: "2 jobs parsed"
- Click import button
- Expect: toast "Imported 2 jobs"
- Expect: "Figma" and "Linear" in pipeline

Test: "W5: imported jobs persist after refresh" { tag: '@critical' }
- Import 2 jobs via CSV (same steps as above)
- Reload page
- Navigate to pipeline
- Expect: "Stripe" and "Notion" still visible

After changes: git add -A && git commit -m "add workflow E2E tests: pipeline management (W4) and import/export (W5)" && git push
```

---

### Prompt E: Write W6 + W7 + W8 + W9 workflow specs (nightly)

```
Read pages/index.js, tests/helpers/setup-storage.js, tests/helpers/navigate-to.js, tests/helpers/mock-api.js, and all fixtures.

Create tests/e2e/wf-outreach.spec.js implementing Workflow W6:

test.beforeEach: setupStorage(page, 'with-5-jobs'), mockAllApiRoutes(page), goto('/')

Test: "W6: select job → get strategy → generate message → copy"
1. navigateTo(page, 'outreach')
2. Click on "Stripe" in the job sidebar
3. Expect: heading or text "Stripe" visible in the main panel
4. Click "Get Strategy" button
5. Wait for strategy to render: expect text containing "Hiring Manager" visible (from mock tier)
6. Click "Generate →" button on the first tier row
7. Wait for message variants: expect buttons "Proof-led", "Question-led", "Value-led"
8. Click "Proof-led"
9. Expect: message text visible in the message display area
10. Click "Copy" button — expect toast "Copied!"

Create tests/e2e/wf-strategy.spec.js implementing Workflow W7:

test.beforeEach: setupStorage(page, 'with-5-jobs'), mockAllApiRoutes(page), goto('/'), navigateTo(page, 'strategy')

Test: "W7: fill inputs → generate brief → verify sections"
1. Fill target role input with "Staff PM at AI company"
2. Fill "What's been working" textarea with "Referrals from former colleagues"
3. Fill "What's not working" textarea with "Cold applications getting no response"
4. Click "Generate Weekly Brief"
5. Wait for brief: expect text from mock — "Submit 3 applications" or "Weekly Focus" section label
6. Expect: "Double Down" section visible
7. Expect: "Stop Doing" section visible
8. Expect: "Encouragement" section visible

Test: "W7: inputs and brief persist after reload"
1. Fill all 3 inputs, generate brief
2. Reload page, navigate to Strategy
3. Expect: target role input still has "Staff PM at AI company"
4. Expect: brief sections still visible

Create tests/e2e/wf-resume-workshop.spec.js implementing Workflow W8:

Test: "W8: analyze resume → get versions → recommend for JD"
1. setupStorage(page, 'onboarded-no-jobs') — has resume text
2. mockAllApiRoutes(page), goto('/'), navigateTo(page, 'workshop')
3. Click "Analyze My Resume"
4. Wait: expect 3 version cards (text "Platform Engineering", "AI Product", "Growth & Lifecycle" from mock)
5. Expect: target role tags visible on first card
6. Scroll to "Which version for this JD?" section
7. Fill JD snippet textarea with "We need a PM for our API platform..."
8. Click "Recommend"
9. Expect: text "Platform Engineering" visible as recommendation (from mock)

Test: "W8: no resume shows empty state"
1. setupStorage(page, 'onboarded-no-resume')
2. mockAllApiRoutes(page), goto('/'), navigateTo(page, 'workshop')
3. Expect: text "Upload your resume first" visible

Create tests/e2e/wf-interview-prep.spec.js implementing Workflow W9:

test.beforeEach: setupStorage(page, 'with-5-jobs'), mockAllApiRoutes(page), goto('/'), navigateTo(page, 'pipeline')

Test: "W9: interview prep for HM Interview job"
1. Verify Oscar Health is visible (it has status "Recruiter Screen" in fixture — we need to change fixture or change job status first)
   Actually, check the fixture: Oscar Health is "Recruiter Screen" which does NOT show Interview Prep button. We need a job at "HM Interview" or "Final Round". 
   Solution: First change Oscar Health's status. Click on Oscar Health to expand, change status dropdown to "HM Interview".
2. Now "Interview Prep" button should be visible
3. Click "Interview Prep"
4. Wait: expect modal heading "Interview Prep" visible
5. Expect: "Oscar Health" in modal subheading
6. Expect: at least 3 question items (numbered questions from mock)
7. Expect: text "Research Before the Interview" visible
8. Close modal (click ✕)
9. Expand Oscar Health again, click "Interview Prep" again
10. Expect: modal opens immediately WITHOUT spinner (cached)
11. Expect: same questions visible

Test: "W9: interview prep button hidden for non-interview statuses"
1. Expand Stripe (status "Applied") → expect "Interview Prep" button NOT visible
2. Expand Calm (status "Rejected") → expect "Interview Prep" button NOT visible

After changes: git add -A && git commit -m "add nightly workflow E2E tests: outreach (W6), strategy (W7), resume workshop (W8), interview prep (W9)" && git push
```

---

### Prompt F: Write W10 preferences propagation spec (PR-critical)

```
Read pages/index.js, tests/helpers/setup-storage.js, tests/helpers/navigate-to.js, tests/helpers/mock-api.js.

Create tests/e2e/wf-preferences-propagation.spec.js implementing Workflow W10:

```javascript
import { test, expect } from '@playwright/test';
import { setupStorage } from '../helpers/setup-storage.js';
import { navigateTo } from '../helpers/navigate-to.js';
import { mockAllApiRoutes } from '../helpers/mock-api.js';
```

All tests tagged { tag: '@critical' }.

test.beforeEach: setupStorage(page, 'onboarded-no-jobs'), mockAllApiRoutes(page), goto('/')

Test: "W10: change prefs → hard skip reflects in Analyze"
1. Click Prefs button (text "Prefs")
2. Expect modal: "Job Search Preferences" heading
3. Scroll to excluded industries, find and click "Cybersecurity" pill to toggle it ON
4. Click "Save Preferences"
5. Expect: toast "Preferences saved"
6. Navigate to Analyze
7. Fill textarea with JD: "We need a cybersecurity analyst for penetration testing and zero trust architecture"
8. Expect: "Hard Skip Detected" banner
9. Expect: text containing "Cybersecurity" in the banner

Test: "W10: salary floor triggers comp warning in hard skip"
1. Click Prefs, change salary to 250 (type 250 in salary input — this means $250K)
2. Save prefs
3. Navigate to Analyze
4. Fill textarea with JD: "Salary range $80k - $120k for this junior analyst position"
5. Expect: hard skip banner with salary warning text

Test: "W10: prefs persist after reload"
1. Click Prefs
2. Change work mode to "Remote" (click Remote button)
3. Toggle "Cybersecurity" exclusion ON
4. Save
5. Reload page
6. Click Prefs
7. Expect: "Remote" button is highlighted/active
8. Expect: "Cybersecurity" pill is highlighted/active

After changes: git add -A && git commit -m "add workflow E2E test: preferences propagation (W10)" && git push
```

---

### Prompt G: Update playbook and CI to use workflow specs

```
Read QA_PLAYBOOK.md, playwright.config.js, and .github/workflows/pr-checks.yml.

1. In playwright.config.js, update the testDir to './tests/e2e' (already set — verify). No changes needed if already correct.

2. In .github/workflows/pr-checks.yml, update the e2e-critical job command to:
   npx playwright test --grep @critical --project=chromium
   This will run only the @critical tagged tests on PR.

3. In .github/workflows/nightly-regression.yml, the full regression already runs all tests. Verify it does NOT use --grep so it includes nightly-only specs.

4. Update QA_PLAYBOOK.md Step 5 section — replace the existing Step 5 content with a note:
   "Step 5 has been replaced by QA_WORKFLOWS.md which implements workflow-first E2E testing. See that document for the 10 workflow journeys and 6 implementation prompts (A through F)."

After changes: git add -A && git commit -m "update CI and playbook to use workflow-driven E2E specs" && git push
```
