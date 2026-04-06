# AsterCopilot QA System — Complete Architecture

## 1. Executive Summary

AsterCopilot is a single-page Next.js 16 application with 3 API routes, zero database (localStorage only), zero auth, and heavy reliance on the Anthropic Claude API. The entire frontend lives in one 42KB file (`pages/index.js`). There are currently zero tests, zero CI/CD pipelines, and zero automated quality gates.

This document defines the complete automated QA system: from static analysis through production smoke checks, with automatic bug documentation and Claude Code fix prompt generation. The system is designed for a solo founder — maximum automation, minimum manual effort.

**Key metrics this system targets:**
- 0 manual test steps for regression
- <5 min feedback on every PR
- Every failure produces a copy-paste Claude Code fix prompt
- Nightly deep regression catches drift
- Production smoke validates every deploy

---

## 2. Assumptions

### What I know (from reading the full codebase)
- **Framework:** Next.js 16.1.6, Pages Router, React 19.2.3
- **Deployment:** Vercel, domain astercopilot.com
- **API routes:** `/api/claude` (proxy), `/api/parse-resume` (PDF/DOCX), `/api/infer-prefs` (resume analysis)
- **State:** 100% localStorage — no database, no server-side state
- **Auth:** None. No login, no sessions, no roles
- **AI dependency:** All analysis features call Claude Sonnet via `/api/claude`
- **File structure:** Monolith — entire app in `pages/index.js` (~1400 lines)
- **CSS:** Inline styles + global CSS string template in JS (no CSS modules, no Tailwind utility classes in markup despite Tailwind being installed)
- **Dependencies:** Minimal — next, react, react-dom, mammoth (DOCX parsing)
- **Existing tests:** Zero
- **Existing CI:** Zero
- **Existing linting:** ESLint config exists but never enforced in CI

### Categories of risk
1. **State corruption** — localStorage can be cleared, corrupted, or hit quota limits
2. **AI response parsing** — Claude returns unparsable JSON, crashes `JSON.parse`
3. **Monolith fragility** — all components in one file, easy to break adjacent features
4. **No error boundaries** — any component crash takes down the entire app
5. **API key exposure** — env var handling on Vercel
6. **Resume parsing failures** — PDF/DOCX edge cases
7. **Mobile responsiveness** — responsive CSS via media queries, untested
8. **Browser compatibility** — uses modern APIs (clipboard, blob downloads)
9. **Performance** — large single JS bundle, no code splitting
10. **Data loss** — localStorage is the only persistence layer

### Where bugs are most likely
1. `JSON.parse` calls on Claude API responses (no try/catch in some paths)
2. localStorage reads on first render (SSR/hydration mismatch)
3. State management across views (no state management library)
4. Import/export CSV parsing edge cases
5. Mobile layout breakpoints
6. Interview prep / strategy brief — async state updates during navigation

---

## 3. Recommended Tooling Stack

| Category | Tool | Why |
|---|---|---|
| **Test runner** | Vitest 3.x | Native ESM, fast, Jest-compatible API, works with Next.js out of the box. Jest is slower and has ESM issues. |
| **E2E browser automation** | Playwright | Multi-browser, auto-wait, trace viewer, video/screenshot capture built-in. Cypress is slower and single-tab only. |
| **API testing** | Playwright `request` context + Vitest | No separate tool needed. Playwright handles HTTP. Vitest handles unit-level API logic. |
| **Mocking/stubbing** | MSW (Mock Service Worker) 2.x | Intercepts at network level, works in browser AND node. Better than mocking fetch directly because it tests real request/response flow. |
| **Fixtures/seed data** | Custom JSON fixtures + Playwright `storageState` | localStorage-based app needs localStorage fixtures, not database seeds. |
| **Visual regression** | Playwright screenshots + `pixelmatch` | Built into Playwright. No need for Percy/Chromatic cost for a solo founder. |
| **Accessibility** | `@axe-core/playwright` | Deque's axe engine, integrated into Playwright. Industry standard. |
| **Coverage** | `v8` via Vitest + `istanbul` via Playwright | Vitest uses V8 natively. Playwright can collect coverage via Istanbul instrumentation. |
| **Test reporting** | Playwright HTML Reporter + GitHub Actions summary | Free, built-in, visual. No external dashboard needed. |
| **CI/CD** | GitHub Actions | Already on GitHub. Free for public repos. Native Vercel integration. |
| **Flaky test management** | Playwright `--retries 2` + custom flaky quarantine list | Simple retries first. Quarantine file for persistent flakes. |
| **Screenshot/video** | Playwright `trace: 'on-first-retry'` | Automatic trace capture on failure. Includes screenshots, network, console. |
| **Bug artifact generation** | Custom Playwright reporter | Custom reporter that writes structured JSON per failure. |
| **Error tracking** | Console log capture in Playwright | No Sentry needed yet. Capture `console.error` in E2E tests. |

---

## 4. QA Architecture

### Flow: Developer Commit → Production

```
LOCAL DEV
  │
  ├─ pre-commit hook (lint-staged)
  │   ├─ ESLint (auto-fix)
  │   └─ Type check (if added later)
  │
  ├─ Developer runs: npm test
  │   ├─ Vitest unit tests (~2s)
  │   └─ Quick smoke E2E (~15s)
  │
  └─ git push
       │
       ▼
PULL REQUEST (GitHub Actions)
  │
  ├─ Job 1: Lint + Unit Tests (Vitest)        ~30s
  ├─ Job 2: E2E Critical Path (Playwright)    ~90s
  ├─ Job 3: API Route Tests (Vitest)          ~20s
  │
  ├─ On failure:
  │   ├─ Upload Playwright traces as artifacts
  │   ├─ Generate bug packages (JSON)
  │   ├─ Generate Claude fix prompts (Markdown)
  │   └─ Post failure summary as PR comment
  │
  └─ All pass → PR mergeable
       │
       ▼
MERGE TO MAIN (GitHub Actions)
  │
  ├─ Full E2E suite (all browsers)            ~3min
  ├─ Visual regression checks                 ~60s
  ├─ Accessibility audit                      ~30s
  │
  ├─ All pass → Vercel auto-deploys
  │
  └─ On failure: block deploy, notify
       │
       ▼
POST-DEPLOY (GitHub Actions, triggered by Vercel webhook)
  │
  ├─ Production smoke test against astercopilot.com  ~30s
  │   ├─ App loads
  │   ├─ Navigation works
  │   ├─ No console errors
  │   └─ API routes respond
  │
  └─ On failure: alert immediately
       │
       ▼
NIGHTLY (GitHub Actions, cron)
  │
  ├─ Full E2E regression (all views, all flows)  ~5min
  ├─ Full visual regression (all views)          ~2min
  ├─ Full accessibility audit (all views)        ~1min
  ├─ Performance budget check (bundle size)      ~30s
  │
  └─ On failure:
      ├─ Generate bug packages
      ├─ Generate Claude fix prompts
      └─ Create GitHub issue automatically
```

---

## 5. Test Strategy by Layer

### Layer 1: Static Analysis
- **Why:** Catch syntax errors, unused variables, bad imports before runtime
- **What:** ESLint with Next.js config
- **Tools:** ESLint 9 + eslint-config-next
- **Pass/fail:** Zero errors (warnings allowed)
- **Runs:** Pre-commit hook + every PR
- **Covers:** All `.js` files in `pages/`

### Layer 2: Unit Tests
- **Why:** Test pure functions in isolation — parsing, scoring, state transforms
- **What:** `checkHardSkip`, `updateProfile`, `matchScore`, `topProfileTags`, CSV/bulk parsers, comp range parsing
- **Tools:** Vitest
- **Pass/fail:** 100% of unit tests pass, >80% coverage on utility functions
- **Runs:** Every PR, pre-commit (fast subset)
- **Covers:** All exported functions, all PROMPTS template generators

### Layer 3: API Route Tests
- **Why:** API routes are the security boundary (API key handling, input validation)
- **What:** `/api/claude`, `/api/parse-resume`, `/api/infer-prefs`
- **Tools:** Vitest + MSW for mocking Anthropic API
- **Pass/fail:** All routes return correct status codes, handle errors gracefully
- **Runs:** Every PR
- **Covers:** Happy path, malformed input, missing API key, Anthropic API errors

### Layer 4: E2E Browser Tests — Critical Path
- **Why:** Verify the actual user experience works end-to-end
- **What:** Onboarding flow, resume upload, JD analysis, pipeline management, navigation
- **Tools:** Playwright (Chromium)
- **Pass/fail:** All critical user journeys complete without error
- **Runs:** Every PR (Chromium only), merge-to-main (all browsers)
- **Covers:** The 8 most important user flows

### Layer 5: E2E Browser Tests — Full Regression
- **Why:** Catch regressions in less-critical features
- **What:** All views, all modals, all interactive elements, all edge cases
- **Tools:** Playwright (Chromium + Firefox + WebKit)
- **Pass/fail:** All tests pass across all browsers
- **Runs:** Nightly, merge-to-main
- **Covers:** Every feature in the test matrix below

### Layer 6: Visual Regression
- **Why:** Catch unintended UI changes (layout shifts, color changes, missing elements)
- **What:** Screenshot comparison of all major views
- **Tools:** Playwright `toHaveScreenshot()` with `pixelmatch`
- **Pass/fail:** <0.1% pixel difference from baseline
- **Runs:** Merge-to-main, nightly
- **Covers:** Dashboard, Analyze, Pipeline, Outreach, Strategy, Resume, Prefs modal, Onboarding

### Layer 7: Accessibility
- **Why:** Legal compliance, usability, SEO
- **What:** WCAG 2.1 AA violations
- **Tools:** `@axe-core/playwright`
- **Pass/fail:** Zero critical or serious violations
- **Runs:** Merge-to-main, nightly
- **Covers:** All views

### Layer 8: Performance / Smoke
- **Why:** Prevent bundle bloat, ensure fast loads
- **What:** Bundle size check, page load time, no console errors
- **Tools:** Playwright + `next build` output parsing
- **Pass/fail:** Bundle <500KB, page load <3s, zero console errors
- **Runs:** Merge-to-main, nightly
- **Covers:** Production build

### Layer 9: Production Smoke
- **Why:** Verify deploy didn't break production
- **What:** Hit astercopilot.com, verify app loads, navigation works, no errors
- **Tools:** Playwright against production URL
- **Pass/fail:** App renders, no console errors, navigation responds
- **Runs:** After every Vercel deploy
- **Covers:** Live production

---

## 6. Exhaustive Test Matrix

### A. Onboarding
| ID | Test Case | Type | Priority |
|---|---|---|---|
| ON-01 | Welcome screen renders with correct copy | Happy | P1 |
| ON-02 | "Get started" navigates to upload step | Happy | P1 |
| ON-03 | "Skip onboarding" goes directly to app | Happy | P1 |
| ON-04 | Resume upload via file picker works (PDF) | Happy | P1 |
| ON-05 | Resume upload via drag and drop works | Happy | P2 |
| ON-06 | Resume upload shows parsing spinner | Happy | P2 |
| ON-07 | Failed PDF parse falls back to paste step | Edge | P1 |
| ON-08 | Paste resume text and continue works | Happy | P2 |
| ON-09 | Email capture saves to localStorage | Happy | P2 |
| ON-10 | Skip email goes to app | Happy | P2 |
| ON-11 | Progress dots update correctly per step | Happy | P3 |
| ON-12 | Preference inference runs after resume upload | Happy | P1 |
| ON-13 | "Reading your background..." appears during inference | Happy | P2 |
| ON-14 | "Preferences configured" appears after inference | Happy | P2 |
| ON-15 | Previously onboarded user skips to app | Regression | P1 |
| ON-16 | Upload 10MB+ file shows appropriate response | Edge | P3 |
| ON-17 | Upload non-PDF/DOC file is rejected | Edge | P2 |

### B. Navigation & App Shell
| ID | Test Case | Type | Priority |
|---|---|---|---|
| NAV-01 | All 6 nav tabs render and are clickable | Happy | P1 |
| NAV-02 | Active tab has forest green background | Happy | P2 |
| NAV-03 | Aster logo and tagline render | Happy | P3 |
| NAV-04 | Prefs button opens PrefsModal | Happy | P1 |
| NAV-05 | Admin button navigates to admin view | Happy | P3 |
| NAV-06 | Resume filename shows when uploaded | Happy | P2 |
| NAV-07 | Mobile hamburger appears below 900px | Happy | P1 |
| NAV-08 | Mobile menu opens/closes correctly | Happy | P1 |
| NAV-09 | Mobile menu links navigate and close menu | Happy | P1 |
| NAV-10 | Footer renders with delete workspace button | Happy | P3 |
| NAV-11 | Delete workspace clears localStorage and reloads | Destructive | P2 |
| NAV-12 | Toast notifications appear and auto-dismiss | Happy | P2 |

### C. Dashboard View
| ID | Test Case | Type | Priority |
|---|---|---|---|
| DASH-01 | 4 stat cards render with correct values | Happy | P1 |
| DASH-02 | Health indicator shows correct state | Happy | P1 |
| DASH-03 | Health indicator shows "Based on your activity" note | Happy | P3 |
| DASH-04 | Contextual ping: stale jobs (3+) shows rose banner | Happy | P2 |
| DASH-05 | Contextual ping: saved roles (5+) shows gold banner | Happy | P2 |
| DASH-06 | Contextual ping: 0% response rate shows gold banner | Happy | P2 |
| DASH-07 | Contextual ping priority: only one shows at a time | Edge | P2 |
| DASH-08 | Today's Actions loads from Claude API | Happy | P1 |
| DASH-09 | Pipeline status bars render for each status | Happy | P2 |
| DASH-10 | Role Profile shows top domains and product types | Happy | P2 |
| DASH-11 | Market Signals shows when 5+ jobs have comp data | Happy | P2 |
| DASH-12 | "Analyze a job" button navigates to analyze view | Happy | P2 |
| DASH-13 | Dashboard with 0 jobs shows appropriate empty state | Edge | P1 |
| DASH-14 | Stale jobs warning appears in pipeline card | Happy | P2 |

### D. Analyze View
| ID | Test Case | Type | Priority |
|---|---|---|---|
| AN-01 | JD textarea accepts paste | Happy | P1 |
| AN-02 | Auto-extract company/role on long JD paste | Happy | P1 |
| AN-03 | Hard skip detection shows warning banner | Happy | P1 |
| AN-04 | Duplicate detection shows warning | Happy | P2 |
| AN-05 | Analyze button calls Claude and shows results | Happy | P1 |
| AN-06 | Fit score ring renders with correct color | Happy | P1 |
| AN-07 | Match score renders when profile exists | Happy | P2 |
| AN-08 | Verdict card shows verdict, reason, tags | Happy | P1 |
| AN-09 | estimatedCompRange tag renders with correct color | Happy | P2 |
| AN-10 | Perks found tags render | Happy | P2 |
| AN-11 | Comp warning shows when below target | Happy | P2 |
| AN-12 | Fit Analysis tab: strengths and gaps render | Happy | P1 |
| AN-13 | Transferability card shows when score>=65 AND fit<75 | Happy | P2 |
| AN-14 | Resume Tailoring tab: summary and bullets render | Happy | P1 |
| AN-15 | ATS Keywords tab: keywords render, click to copy | Happy | P2 |
| AN-16 | Save to pipeline with status selector works | Happy | P1 |
| AN-17 | Saved job appears in pipeline | Regression | P1 |
| AN-18 | Analysis with no resume shows warning | Edge | P2 |
| AN-19 | Empty JD textarea — analyze button disabled | Edge | P1 |
| AN-20 | Claude API failure shows error toast | Failure | P1 |
| AN-21 | Malformed Claude response doesn't crash app | Failure | P1 |
| AN-22 | Resume recommendation shows version or null | Happy | P2 |

### E. Pipeline View
| ID | Test Case | Type | Priority |
|---|---|---|---|
| PL-01 | All jobs render in list | Happy | P1 |
| PL-02 | Filter pills filter by status | Happy | P1 |
| PL-03 | Expand job shows details panel | Happy | P1 |
| PL-04 | Status dropdown changes job status | Happy | P1 |
| PL-05 | Checkbox selects job | Happy | P1 |
| PL-06 | Select All selects all filtered jobs | Happy | P1 |
| PL-07 | Deselect All clears selection | Happy | P1 |
| PL-08 | Bulk status change applies to all selected | Happy | P1 |
| PL-09 | Bulk action shows toast with count | Happy | P2 |
| PL-10 | Remove job deletes from pipeline | Happy | P1 |
| PL-11 | Import History modal opens | Happy | P1 |
| PL-12 | CSV import: parse and import works | Happy | P1 |
| PL-13 | CSV import: header row skipped | Happy | P2 |
| PL-14 | Manual entry import works | Happy | P2 |
| PL-15 | Bulk paste import works | Happy | P2 |
| PL-16 | Import persists to localStorage | Regression | P1 |
| PL-17 | Export CSV downloads file | Happy | P1 |
| PL-18 | Export CSV contains all jobs | Happy | P2 |
| PL-19 | Interview Prep button calls Claude | Happy | P1 |
| PL-20 | Interview Prep modal shows questions | Happy | P1 |
| PL-21 | Interview Prep cached on second click | Happy | P2 |
| PL-22 | Outreach button navigates to outreach view | Happy | P2 |
| PL-23 | Empty pipeline shows empty state | Edge | P1 |
| PL-24 | Stale job shows "Follow up" warning | Happy | P2 |
| PL-25 | "X of Y selected" count is correct | Happy | P2 |

### F. Outreach View
| ID | Test Case | Type | Priority |
|---|---|---|---|
| OUT-01 | Job list sidebar renders | Happy | P1 |
| OUT-02 | Select job shows company/role header | Happy | P1 |
| OUT-03 | Get Strategy calls Claude | Happy | P1 |
| OUT-04 | Strategy tiers render | Happy | P1 |
| OUT-05 | Generate message for persona works | Happy | P1 |
| OUT-06 | Message variants render with tabs | Happy | P1 |
| OUT-07 | Copy button copies message to clipboard | Happy | P2 |
| OUT-08 | Follow-up sequence renders | Happy | P2 |
| OUT-09 | Add Contact form works | Happy | P2 |
| OUT-10 | Contact status update works | Happy | P2 |
| OUT-11 | Follow-up due section renders | Happy | P3 |
| OUT-12 | No jobs selected shows empty state | Edge | P2 |

### G. Strategy View
| ID | Test Case | Type | Priority |
|---|---|---|---|
| ST-01 | Three input cards render | Happy | P1 |
| ST-02 | Input auto-saves to localStorage | Happy | P1 |
| ST-03 | Generate Weekly Brief calls Claude | Happy | P1 |
| ST-04 | Brief result renders 4 sections | Happy | P1 |
| ST-05 | Brief persists in localStorage on reload | Regression | P1 |
| ST-06 | Inputs restore from localStorage on load | Regression | P1 |

### H. Resume Workshop View
| ID | Test Case | Type | Priority |
|---|---|---|---|
| RW-01 | No resume shows empty state | Edge | P1 |
| RW-02 | Analyze My Resume calls Claude | Happy | P1 |
| RW-03 | Version cards render (2-4 cards) | Happy | P1 |
| RW-04 | Target roles and companies show as tags | Happy | P2 |
| RW-05 | Lead With shows as bullet list | Happy | P2 |
| RW-06 | "Which version for this JD" textarea works | Happy | P1 |
| RW-07 | Recommend button returns recommendation | Happy | P1 |
| RW-08 | Versions persist in localStorage | Regression | P1 |

### I. Preferences Modal
| ID | Test Case | Type | Priority |
|---|---|---|---|
| PR-01 | Modal opens and closes | Happy | P1 |
| PR-02 | Salary input updates correctly | Happy | P1 |
| PR-03 | Work mode pills toggle | Happy | P1 |
| PR-04 | Employment type pills toggle | Happy | P1 |
| PR-05 | People management toggle works | Happy | P1 |
| PR-06 | Target industries toggle | Happy | P1 |
| PR-07 | Custom target industries text input works | Happy | P2 |
| PR-08 | Excluded industries grouped by category | Happy | P1 |
| PR-09 | Excluded industries scroll container works | Happy | P2 |
| PR-10 | Custom exclusions text input works | Happy | P2 |
| PR-11 | Perks toggle works | Happy | P2 |
| PR-12 | Save button persists all prefs | Happy | P1 |
| PR-13 | Cancel button discards changes | Happy | P2 |
| PR-14 | Inferred banner shows when prefsInferred=true | Happy | P2 |
| PR-15 | Inferred summary shows when present | Happy | P3 |
| PR-16 | Dismissing inferred banner works | Happy | P3 |

### J. Error & Edge Cases
| ID | Test Case | Type | Priority |
|---|---|---|---|
| ERR-01 | App loads with empty localStorage | Edge | P1 |
| ERR-02 | App loads with corrupted localStorage | Edge | P1 |
| ERR-03 | Claude API timeout shows error toast | Failure | P1 |
| ERR-04 | Claude API returns non-JSON | Failure | P1 |
| ERR-05 | Network offline — app still renders | Failure | P2 |
| ERR-06 | localStorage quota exceeded | Edge | P3 |
| ERR-07 | Rapid tab switching doesn't crash | Edge | P2 |
| ERR-08 | Multiple simultaneous Claude calls | Edge | P2 |
| ERR-09 | Back/forward browser navigation | Edge | P2 |
| ERR-10 | Page refresh preserves state | Regression | P1 |

### K. Responsive / Cross-Browser
| ID | Test Case | Type | Priority |
|---|---|---|---|
| RES-01 | Desktop 1440px — all views render correctly | Happy | P1 |
| RES-02 | Tablet 768px — layout adapts | Happy | P2 |
| RES-03 | Mobile 375px — hamburger menu, stacked layout | Happy | P1 |
| RES-04 | Firefox — all features work | Happy | P2 |
| RES-05 | Safari/WebKit — all features work | Happy | P2 |

---

## 7. Repository Structure

```
tests/
├── unit/                          # Vitest unit tests
│   ├── checkHardSkip.test.js
│   ├── updateProfile.test.js
│   ├── matchScore.test.js
│   ├── csvParser.test.js
│   ├── compRange.test.js
│   └── healthIndicator.test.js
│
├── api/                           # API route tests
│   ├── claude.test.js
│   ├── parse-resume.test.js
│   └── infer-prefs.test.js
│
├── e2e/                           # Playwright E2E tests
│   ├── onboarding.spec.js
│   ├── navigation.spec.js
│   ├── dashboard.spec.js
│   ├── analyze.spec.js
│   ├── pipeline.spec.js
│   ├── outreach.spec.js
│   ├── strategy.spec.js
│   ├── resume-workshop.spec.js
│   ├── preferences.spec.js
│   ├── import-export.spec.js
│   ├── interview-prep.spec.js
│   ├── responsive.spec.js
│   └── production-smoke.spec.js
│
├── visual/                        # Visual regression specs
│   ├── views.spec.js
│   └── snapshots/                 # Baseline screenshots (gitignored initially)
│       └── .gitkeep
│
├── a11y/                          # Accessibility tests
│   └── audit.spec.js
│
├── fixtures/                      # Test data
│   ├── localStorage/
│   │   ├── empty.json
│   │   ├── onboarded-no-jobs.json
│   │   ├── with-5-jobs.json
│   │   ├── with-20-jobs-mixed.json
│   │   └── corrupted.json
│   ├── resumes/
│   │   ├── sample-resume.txt
│   │   └── sample-resume.pdf
│   ├── jds/
│   │   ├── senior-pm-stripe.txt
│   │   ├── nurse-practitioner.txt
│   │   └── software-engineer.txt
│   └── api-responses/
│       ├── analyze-success.json
│       ├── analyze-malformed.json
│       ├── extract-jd-success.json
│       ├── infer-prefs-success.json
│       └── claude-error.json
│
├── mocks/
│   ├── handlers.js                # MSW request handlers
│   └── server.js                  # MSW server setup
│
├── helpers/
│   ├── setup-storage.js           # Load localStorage fixtures into browser
│   ├── wait-for-toast.js          # Wait for toast notification
│   ├── navigate-to.js             # Navigate to specific view
│   └── mock-claude.js             # Mock Claude API responses
│
├── reporters/
│   ├── bug-package-reporter.js    # Generates bug packages from failures
│   └── claude-prompt-reporter.js  # Generates Claude fix prompts
│
├── artifacts/                     # Generated on failure (gitignored)
│   ├── bug-packages/
│   ├── claude-prompts/
│   ├── screenshots/
│   ├── traces/
│   └── videos/
│
└── docs/
    └── test-matrix.md

# Config files at repo root
vitest.config.js
playwright.config.js
.github/
└── workflows/
    ├── pr-checks.yml
    ├── merge-checks.yml
    ├── nightly-regression.yml
    └── production-smoke.yml
```

---

## 8. Phased Implementation Plan

### Phase 1: Fastest Path to Real Coverage (Week 1)
**Goal:** Go from zero tests to meaningful coverage in 3 days.

**Deliverables:**
1. Install Vitest + Playwright + MSW
2. Extract testable functions from `pages/index.js` into `lib/` modules
3. Write 15 unit tests for pure functions
4. Write 5 critical path E2E tests (onboard, analyze, pipeline, navigate, prefs)
5. Set up GitHub Actions PR workflow
6. Set up bug package reporter
7. Set up Claude prompt generator

**Order of operations:**
1. `npm install -D vitest @vitejs/plugin-react playwright @playwright/test msw @axe-core/playwright`
2. Create `vitest.config.js` and `playwright.config.js`
3. Extract `checkHardSkip`, `updateProfile`, `matchScore`, `topProfileTags` into `lib/utils.js`
4. Write unit tests for extracted functions
5. Create localStorage fixtures
6. Write E2E: onboarding skip → navigate all tabs → verify renders
7. Write E2E: paste JD → analyze → save to pipeline
8. Create `.github/workflows/pr-checks.yml`
9. Create bug package reporter
10. Create Claude prompt reporter

**Effort:** ~8 hours of Claude Code prompting
**Risk reduction:** Goes from 0% to ~60% critical path coverage

### Phase 2: Deeper Automation (Week 2-3)
**Goal:** Full E2E coverage, visual regression, accessibility, API tests.

**Deliverables:**
1. Complete E2E test matrix (all views, all features)
2. API route tests with MSW mocking
3. Visual regression baselines for all views
4. Accessibility audit for all views
5. Merge-to-main and nightly workflows
6. Production smoke test
7. Error scenario tests (API failures, malformed data)

**Order of operations:**
1. Write remaining E2E tests (outreach, strategy, resume workshop, import/export)
2. Write API route tests
3. Add visual regression specs
4. Add accessibility specs
5. Create merge-to-main workflow
6. Create nightly regression workflow
7. Create production smoke workflow
8. Add error scenario E2E tests

**Effort:** ~12 hours of Claude Code prompting
**Risk reduction:** ~60% → ~90% coverage

### Phase 3: Full Autonomous QA Loop (Week 4+)
**Goal:** Self-running system that catches and documents everything.

**Deliverables:**
1. Automatic GitHub issue creation from failures
2. Flaky test quarantine system
3. Performance budget monitoring
4. Bundle size tracking
5. Cross-browser nightly runs (Firefox + WebKit)
6. Responsive viewport tests
7. Chaos testing (random localStorage corruption, API timeouts)

**Effort:** ~6 hours of Claude Code prompting
**Risk reduction:** ~90% → ~97% coverage

---

## 9. Bug Package Template

Every failed test automatically generates a JSON file:

```json
{
  "id": "BUG-20260405-143022-AN05",
  "title": "Analyze View: Claude API failure does not show error toast",
  "severity": "P1",
  "category": "error-handling",
  "environment": {
    "browser": "chromium",
    "viewport": "1280x720",
    "os": "linux",
    "nodeVersion": "20.11.0",
    "nextVersion": "16.1.6"
  },
  "location": {
    "url": "http://localhost:3000",
    "view": "analyze",
    "component": "AnalyzeView"
  },
  "test": {
    "file": "tests/e2e/analyze.spec.js",
    "name": "should show error toast when Claude API fails",
    "line": 42
  },
  "reproduction": {
    "steps": [
      "Navigate to Analyze tab",
      "Paste a job description",
      "Click Analyze with Aster AI",
      "API returns 500 error"
    ],
    "preconditions": "User is onboarded, resume uploaded"
  },
  "expected": "Error toast appears: 'Analysis failed. Check your connection.'",
  "actual": "Unhandled promise rejection, app shows infinite spinner",
  "evidence": {
    "screenshot": "artifacts/screenshots/BUG-20260405-143022-AN05.png",
    "trace": "artifacts/traces/BUG-20260405-143022-AN05.zip",
    "video": "artifacts/videos/BUG-20260405-143022-AN05.webm",
    "consoleErrors": [
      "Uncaught (in promise) SyntaxError: Unexpected token '<' at JSON.parse",
      "Error: Cannot read properties of undefined (reading 'fitScore')"
    ],
    "networkErrors": [
      {
        "url": "/api/claude",
        "status": 500,
        "body": "{\"error\":\"Internal Server Error\"}"
      }
    ]
  },
  "analysis": {
    "likelyRootCause": "callClaude() in pages/index.js does not catch non-JSON responses. When API returns 500, JSON.parse throws on HTML error page.",
    "impactedArea": "AnalyzeView — analyze function",
    "regressionRisk": "High — same pattern exists in all callClaude consumers",
    "suggestedFiles": ["pages/index.js:171-176"]
  },
  "metadata": {
    "timestamp": "2026-04-05T14:30:22.000Z",
    "commitSha": "3d77738",
    "branch": "main",
    "ciRunUrl": "https://github.com/zubairmagdum/aster/actions/runs/12345",
    "tags": ["api", "error-handling", "critical"]
  }
}
```

---

## 10. Claude Code Prompt Generator Templates

### Universal Template

```markdown
Read pages/index.js. Fix the following bug:

**Bug:** [TITLE]

**What happens:** [ACTUAL BEHAVIOR]

**What should happen:** [EXPECTED BEHAVIOR]

**How to reproduce:**
1. [STEP 1]
2. [STEP 2]
3. [STEP 3]

**Likely location:** [FILE:LINE RANGE]

**Root cause hypothesis:** [ANALYSIS]

**Requirements:**
- Fix the bug with minimal changes
- Do not refactor surrounding code
- Do not break existing behavior
- Add a comment only if the fix is non-obvious

**Acceptance criteria:**
- [SPECIFIC TESTABLE OUTCOME 1]
- [SPECIFIC TESTABLE OUTCOME 2]

After fix: git add -A && git commit -m "[COMMIT MSG]" && git push
```

### Frontend Bug Template

```markdown
Read pages/index.js. Fix this UI bug:

**Bug:** [TITLE]

**Component:** [COMPONENT NAME, e.g. AnalyzeView]

**What happens:** [ACTUAL BEHAVIOR — be specific about what renders or doesn't]

**What should happen:** [EXPECTED BEHAVIOR — be specific about layout, text, visibility]

**How to reproduce:**
1. [Navigate to X view]
2. [Interact with Y element]
3. [Observe Z]

**Viewport:** [Desktop 1280px / Mobile 375px / Tablet 768px]

**Likely location:** [COMPONENT FUNCTION, approximate line range]

**Root cause hypothesis:** [e.g. "conditional rendering check is wrong", "style prop missing"]

**Requirements:**
- Fix only the rendering/style issue
- Do not change component logic or state management
- Preserve existing inline style patterns (this app uses inline styles, not CSS classes)
- Do not add new CSS classes or external stylesheets
- Do not break responsive behavior

**Acceptance criteria:**
- [Element X renders correctly in Y state]
- [Layout does not shift on Z viewport]

After fix: git add -A && git commit -m "fix: [description]" && git push
```

### API / Backend Bug Template

```markdown
Read pages/api/[ROUTE].js. Fix this API bug:

**Bug:** [TITLE]

**Route:** [METHOD] /api/[ROUTE]

**What happens:** [ACTUAL RESPONSE — status code, body, error]

**What should happen:** [EXPECTED RESPONSE — status code, body structure]

**Request that triggers the bug:**
```json
[REQUEST BODY]
```

**Likely location:** pages/api/[ROUTE].js

**Root cause hypothesis:** [e.g. "missing error handling for non-JSON Anthropic response"]

**Requirements:**
- Fix the API route handler
- Return appropriate HTTP status codes
- Do not expose internal error details to client
- Do not modify the request/response contract (same input → same output shape)
- Handle edge cases: missing fields, malformed input, upstream API errors
- Keep the existing pattern of proxying to Anthropic API

**Acceptance criteria:**
- [Route returns 200 with correct JSON for valid input]
- [Route returns 400/500 with error JSON for invalid input]
- [No unhandled promise rejections in server logs]

After fix: git add -A && git commit -m "fix: [description]" && git push
```

### State Management / Async Bug Template

```markdown
Read pages/index.js. Fix this state management bug:

**Bug:** [TITLE]

**Component:** [COMPONENT NAME]

**What happens:** [ACTUAL STATE BEHAVIOR — stale data, race condition, lost update]

**What should happen:** [EXPECTED STATE BEHAVIOR]

**How to reproduce:**
1. [Action that triggers state change]
2. [Concurrent or subsequent action]
3. [Observe incorrect state]

**Likely location:** [useState/useEffect hooks in COMPONENT, approximate line range]

**Root cause hypothesis:** [e.g. "stale closure in useEffect", "setState not using functional update", "missing dependency in useEffect"]

**State involved:**
- [State variable 1]: [expected value vs actual value]
- [State variable 2]: [expected value vs actual value]

**localStorage keys affected:** [e.g. aster_jobs, aster_prefs]

**Requirements:**
- Fix the state update logic
- Use functional setState (prev => ...) when depending on previous state
- Ensure localStorage stays in sync with React state
- Do not introduce useReducer or external state management
- Do not change the existing state architecture

**Acceptance criteria:**
- [State correctly reflects X after Y action]
- [localStorage contains correct data after Z]
- [No stale data on page refresh]

After fix: git add -A && git commit -m "fix: [description]" && git push
```

### Auth / Permissions Bug Template

Not applicable — AsterCopilot has no auth system. Skip.

### UI/UX Polish Bug Template

```markdown
Read pages/index.js. Fix this UI polish issue:

**Bug:** [TITLE]

**Component:** [COMPONENT NAME]

**What looks wrong:** [SPECIFIC VISUAL ISSUE — spacing, color, alignment, overflow, truncation]

**What it should look like:** [EXPECTED APPEARANCE — reference the design tokens: T.forest, T.cream, RADIUS.md, etc.]

**Screenshot:** [SCREENSHOT PATH if available]

**Viewport:** [Desktop / Mobile / Both]

**Likely location:** [Inline style object in COMPONENT, approximate line]

**Root cause hypothesis:** [e.g. "missing flexWrap:'wrap'", "gap too large", "color should be T.gray not T.gray2"]

**Design token reference:**
- Colors: T.cream, T.forest, T.rose, T.gold, T.charcoal, T.gray, T.sage
- Radius: RADIUS.sm(8), RADIUS.md(14), RADIUS.lg(20), RADIUS.xl(28), RADIUS.pill(999)
- Shadows: SHADOW.sm, SHADOW.md, SHADOW.lg
- Fonts: Playfair Display (headers), DM Sans (body), DM Mono (numbers)

**Requirements:**
- Fix only the visual issue
- Use existing design tokens (T.*, RADIUS.*, SHADOW.*)
- Maintain existing inline style pattern
- Do not add new components or abstractions

**Acceptance criteria:**
- [Element looks correct at specified viewport]
- [No visual regression in adjacent elements]

After fix: git add -A && git commit -m "fix: [description]" && git push
```

---

## 11. CI/CD Spec

### PR Checks (`.github/workflows/pr-checks.yml`)

```yaml
name: PR Checks
on:
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx vitest run --reporter=verbose
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: unit-test-results
          path: tests/artifacts/

  e2e-critical:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test tests/e2e/ --project=chromium --grep @critical
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: e2e-failure-artifacts
          path: |
            tests/artifacts/
            test-results/
          retention-days: 7
```

### Merge Checks (`.github/workflows/merge-checks.yml`)

```yaml
name: Merge Checks
on:
  push:
    branches: [main]

jobs:
  full-e2e:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        project: [chromium, firefox, webkit]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test --project=${{ matrix.project }}
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: merge-artifacts-${{ matrix.project }}
          path: tests/artifacts/
          retention-days: 14

  visual-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test tests/visual/ --project=chromium
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: visual-diff
          path: test-results/
          retention-days: 14

  accessibility:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test tests/a11y/ --project=chromium
```

### Nightly Regression (`.github/workflows/nightly-regression.yml`)

```yaml
name: Nightly Regression
on:
  schedule:
    - cron: '0 6 * * *'   # 6am UTC daily
  workflow_dispatch:

jobs:
  full-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test --retries=2
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - run: npx playwright test tests/visual/ tests/a11y/
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: nightly-report
          path: |
            tests/artifacts/
            test-results/
            playwright-report/
          retention-days: 30
```

### Production Smoke (`.github/workflows/production-smoke.yml`)

```yaml
name: Production Smoke
on:
  workflow_dispatch:
  repository_dispatch:
    types: [vercel-deploy]

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test tests/e2e/production-smoke.spec.js --project=chromium
        env:
          BASE_URL: https://astercopilot.com
```

### Policies

| Policy | Value |
|---|---|
| Retry on failure | 2 retries in nightly, 0 in PR |
| Flaky quarantine | Tests tagged `@flaky` skip in PR, run in nightly only |
| Artifact retention | PR: 7 days, Merge: 14 days, Nightly: 30 days |
| Failure notification | GitHub Actions built-in email on failure |
| Branch protection | Require `lint`, `unit-tests`, `e2e-critical` to pass before merge |
| Release gate | All merge checks must pass before Vercel deploys |

---

## 12. Definition of Done

### Feature is done when:
- [ ] Feature works in Chromium, Firefox, WebKit
- [ ] E2E test covers the happy path
- [ ] No console errors during feature use
- [ ] Responsive at 375px, 768px, 1440px
- [ ] localStorage state persists across refresh
- [ ] No visual regression in adjacent views
- [ ] PR checks pass

### Bug fix is done when:
- [ ] Root cause identified and documented in commit message
- [ ] Fix is minimal — no unrelated changes
- [ ] Regression test added that would have caught this bug
- [ ] PR checks pass
- [ ] Manual verification in browser confirms fix

### Release candidate is done when:
- [ ] All merge checks pass (3 browsers)
- [ ] Visual regression passes
- [ ] Accessibility audit passes
- [ ] Production smoke passes after deploy
- [ ] No P1 bugs open

### QA system is done when:
- [ ] >80% of test matrix has automated coverage
- [ ] Every PR gets lint + unit + E2E feedback in <5 min
- [ ] Every failure generates a bug package
- [ ] Every bug package generates a Claude fix prompt
- [ ] Nightly regression runs without manual intervention
- [ ] Production smoke validates every deploy

---

## 13. First Sprint Build Plan

### Files to create (in order):

1. `vitest.config.js` — Vitest configuration
2. `playwright.config.js` — Playwright configuration
3. `lib/utils.js` — Extract pure functions from `pages/index.js`
4. `tests/fixtures/localStorage/onboarded-no-jobs.json` — Base fixture
5. `tests/fixtures/localStorage/with-5-jobs.json` — Jobs fixture
6. `tests/fixtures/api-responses/analyze-success.json` — Mock Claude response
7. `tests/mocks/handlers.js` — MSW handlers for Claude API
8. `tests/mocks/server.js` — MSW server setup
9. `tests/helpers/setup-storage.js` — localStorage injection helper
10. `tests/unit/checkHardSkip.test.js` — First unit test
11. `tests/unit/matchScore.test.js` — Second unit test
12. `tests/unit/csvParser.test.js` — Third unit test
13. `tests/e2e/navigation.spec.js` — First E2E test
14. `tests/e2e/analyze.spec.js` — Second E2E test
15. `tests/e2e/pipeline.spec.js` — Third E2E test
16. `tests/reporters/bug-package-reporter.js` — Bug package generator
17. `tests/reporters/claude-prompt-reporter.js` — Claude prompt generator
18. `.github/workflows/pr-checks.yml` — CI pipeline

### First commands to run:

```bash
# Install test dependencies
npm install -D vitest @vitejs/plugin-react jsdom msw
npm install -D @playwright/test @axe-core/playwright
npx playwright install --with-deps chromium

# Verify Vitest works
npx vitest run --reporter=verbose

# Verify Playwright works
npx playwright test --project=chromium

# Verify build still works
npm run build
```

### First test to write:

`tests/unit/checkHardSkip.test.js` — because it is a pure function with clear inputs/outputs, no mocking needed, and covers critical business logic.

---

## COPY/PASTE BUILD PROMPTS

Use these prompts in sequence with Claude Code to build the QA system.

---

### Prompt 1: Set up test framework

```
Read pages/index.js and package.json.

Install Vitest and Playwright as dev dependencies:
npm install -D vitest @vitejs/plugin-react jsdom msw @playwright/test @axe-core/playwright

Create vitest.config.js at repo root:
- Use jsdom environment
- Set test include pattern to tests/unit/**/*.test.js and tests/api/**/*.test.js
- Set globals to true
- Set setupFiles to tests/mocks/server.js

Create playwright.config.js at repo root:
- Set testDir to tests/e2e
- Set retries to 0 for CI, 2 for nightly
- Configure projects: chromium (default), firefox, webkit
- Set webServer to npm run dev on port 3000
- Set outputDir to test-results
- Set trace to on-first-retry
- Set screenshot to only-on-failure
- Set video to retain-on-failure
- Add custom reporter: tests/reporters/bug-package-reporter.js

Create empty placeholder files for:
- tests/mocks/server.js
- tests/mocks/handlers.js
- tests/reporters/bug-package-reporter.js

Add scripts to package.json:
- "test": "vitest run"
- "test:watch": "vitest"
- "test:e2e": "playwright test"
- "test:e2e:headed": "playwright test --headed"

After changes: git add -A && git commit -m "set up vitest and playwright test framework" && git push
```

---

### Prompt 2: Extract testable functions

```
Read pages/index.js carefully. Extract these pure functions into a new file lib/utils.js:

1. checkHardSkip(jdText, prefs) — the entire function including domainMap and mgmtRequired
2. updateProfile(currentProfile, roleDNA, outcome) — profile learning function
3. matchScore(roleDNA, profile) — score calculation
4. topProfileTags(profile, cat, n) — tag extraction
5. getWeekKey(ts) — week key calculator

Export all 5 functions as named exports from lib/utils.js.

In pages/index.js, replace the function definitions with imports:
import { checkHardSkip, updateProfile, matchScore, topProfileTags, getWeekKey } from '../lib/utils';

Remove the now-duplicated function bodies from pages/index.js but keep the import.

Make sure T (brand tokens), RADIUS, STATUS_CFG, STATUSES, and DEFAULT_PREFS are also in lib/utils.js if any extracted function needs them. If checkHardSkip references STATUSES, include it. Keep the originals in pages/index.js too since the UI needs them.

Run npm run build to verify nothing breaks.

After changes: git add -A && git commit -m "extract pure functions to lib/utils.js for testability" && git push
```

---

### Prompt 3: Write unit tests

```
Read lib/utils.js. Write comprehensive unit tests:

Create tests/unit/checkHardSkip.test.js:
- Test: returns empty array when no exclusions set
- Test: detects Gaming domain exclusion from JD text containing "video game"
- Test: detects Cybersecurity exclusion from "penetration testing"
- Test: detects custom exclusion from prefs.customExclusions "fast food"
- Test: detects people management requirement when hasPeopleManagement is false
- Test: does NOT flag people management when hasPeopleManagement is true
- Test: detects salary below floor
- Test: returns multiple reasons when multiple disqualifiers present
- Test: handles empty JD text
- Test: handles undefined/null prefs gracefully

Create tests/unit/matchScore.test.js:
- Test: returns null when no profile data
- Test: returns null when no roleDNA
- Test: returns score between 0-100 for valid inputs
- Test: higher score for matching domains
- Test: lower score for non-matching domains

Create tests/unit/updateProfile.test.js:
- Test: adds new domain to empty profile
- Test: increments existing domain count
- Test: applies boost multiplier for different outcomes
- Test: handles missing roleDNA fields gracefully

Create tests/unit/csvParser.test.js:
(For this test, extract the CSV parsing logic from ImportHistoryModal into lib/utils.js first — the parseCSV and parseBulk functions. Then test:)
- Test: parses valid CSV line into job object
- Test: skips header row starting with "company,"
- Test: maps outcome "Rejected" to status "Rejected"
- Test: maps outcome "No Response" to status "Applied"
- Test: handles missing fields gracefully
- Test: parses pipe-separated bulk format
- Test: handles empty input

Run: npx vitest run --reporter=verbose

After changes: git add -A && git commit -m "add unit tests for core utility functions" && git push
```

---

### Prompt 4: Add localStorage fixtures and helpers

```
Create test fixtures and helpers for E2E tests:

Create tests/fixtures/localStorage/onboarded-no-jobs.json:
{
  "aster_onboarded": true,
  "aster_resume": "John Doe - Software Engineer with 5 years experience at Stripe and Google. Skills: Python, React, AWS.",
  "aster_resume_name": "john-doe-resume.pdf",
  "aster_jobs": [],
  "aster_contacts": [],
  "aster_profile": {},
  "aster_prefs": {
    "minSalary": 150000,
    "workMode": "Any",
    "employmentType": "Full-time",
    "seniorityTarget": "Senior",
    "hasPeopleManagement": false,
    "excludedIndustries": [],
    "excludedCities": [],
    "targetIndustries": [],
    "importantPerks": [],
    "customExclusions": "",
    "customTargetIndustries": ""
  }
}

Create tests/fixtures/localStorage/with-5-jobs.json:
Same as above but with aster_jobs containing 5 sample jobs with varied statuses (Saved, Applied, Applied, Recruiter Screen, Rejected), varied fitScores, and dateAdded within last 14 days.

Create tests/fixtures/jds/sample-jd.txt:
A realistic 200-word job description for a Senior Software Engineer at a SaaS company.

Create tests/helpers/setup-storage.js:
Export an async function setupStorage(page, fixtureName) that:
1. Reads the fixture JSON from tests/fixtures/localStorage/{fixtureName}.json
2. Uses page.evaluate to set each key-value pair in localStorage
3. Reloads the page after setting storage

Create tests/helpers/navigate-to.js:
Export an async function navigateTo(page, viewName) that:
1. Clicks the nav button matching the view name
2. Waits for the view content to be visible

After changes: git add -A && git commit -m "add test fixtures and helpers" && git push
```

---

### Prompt 5: Write critical path E2E tests

```
Read pages/index.js and tests/helpers/. Write E2E tests using Playwright.

Create tests/e2e/navigation.spec.js:
Tag all tests with @critical.
- Test: app loads without console errors
- Test: all 6 nav tabs are visible and clickable (Dashboard, Analyze, Pipeline, Outreach, Strategy, Resume)
- Test: clicking each tab shows the correct view
- Test: Prefs button opens preferences modal
- Test: preferences modal can be closed
- Test: mobile hamburger menu appears at 375px width
- Test: mobile menu links navigate correctly

Create tests/e2e/analyze.spec.js:
Tag with @critical. Use MSW or route interception (page.route) to mock /api/claude responses.
- Test: JD textarea accepts text input
- Test: analyze button is disabled when textarea is empty
- Test: analyze button triggers loading spinner (mock API, return after delay)
- Test: successful analysis shows verdict card with fit score
- Test: save to pipeline button adds job to pipeline view
- Test: hard skip warning shows for excluded domain (set prefs with excludedIndustries:["Gaming"], paste JD with "video game")

Create tests/e2e/pipeline.spec.js:
Tag with @critical. Use with-5-jobs fixture.
- Test: all 5 jobs render in list
- Test: filter pills filter correctly
- Test: expanding a job shows detail panel
- Test: Select All selects all visible jobs
- Test: bulk status change updates all selected
- Test: Export CSV triggers download
- Test: Import History modal opens

Before each test, use setupStorage to load the appropriate fixture.
Use page.route('/api/claude', ...) to intercept Claude API calls and return fixture responses.

After changes: git add -A && git commit -m "add critical path E2E tests" && git push
```

---

### Prompt 6: Add bug package reporter

```
Create tests/reporters/bug-package-reporter.js — a custom Playwright reporter.

Implement the reporter class with these methods:
- onTestEnd(test, result): if result.status === 'failed', generate a bug package
- onEnd(): write summary of all failures

Each bug package should be a JSON file written to tests/artifacts/bug-packages/ with:
- id: "BUG-" + timestamp + "-" + test file name abbreviation
- title: test.title
- severity: P1 if tagged @critical, P2 otherwise
- test.file, test.line
- expected: from test annotations or error message
- actual: result.error.message
- consoleErrors: from result.stderr or attachments
- screenshot: path to failure screenshot (Playwright auto-captures)
- trace: path to trace zip
- commitSha: from process.env.GITHUB_SHA or git rev-parse HEAD
- branch: from process.env.GITHUB_REF or git branch --show-current
- timestamp: ISO string

Create the artifacts directory structure:
tests/artifacts/bug-packages/.gitkeep
tests/artifacts/claude-prompts/.gitkeep
tests/artifacts/screenshots/.gitkeep

Add tests/artifacts/ to .gitignore (except .gitkeep files).

Register this reporter in playwright.config.js alongside the default html reporter.

After changes: git add -A && git commit -m "add bug package reporter for automatic failure documentation" && git push
```

---

### Prompt 7: Add Claude fix prompt generator

```
Create tests/reporters/claude-prompt-reporter.js — a custom Playwright reporter that generates Claude Code fix prompts.

In onTestEnd, when a test fails:
1. Read the bug package JSON that was just generated
2. Determine the prompt template based on tags:
   - @api → API bug template
   - @state → State management template
   - @ui → UI polish template
   - default → Universal template
3. Fill in the template with data from the bug package
4. Write a .md file to tests/artifacts/claude-prompts/

The generated prompt should be a complete, copy-paste-ready Claude Code prompt following the templates defined in QA_SYSTEM.md section 10.

Key requirements:
- Each prompt must start with "Read pages/index.js" (or the relevant file)
- Each prompt must end with "After fix: git add -A && git commit -m '...' && git push"
- Each prompt must include reproduction steps
- Each prompt must include acceptance criteria
- The prompt must reference the specific component and approximate line numbers if available

Register this reporter in playwright.config.js (add to the reporter array after bug-package-reporter).

After changes: git add -A && git commit -m "add Claude Code fix prompt generator" && git push
```

---

### Prompt 8: Wire CI/CD

```
Create GitHub Actions workflows for the QA pipeline.

Create .github/workflows/pr-checks.yml:
- Trigger: pull_request to main
- Jobs: lint (npm run lint), unit-tests (npx vitest run), e2e-critical (playwright test --grep @critical --project=chromium)
- Upload artifacts on failure: tests/artifacts/, test-results/
- Use node 20, ubuntu-latest
- Set ANTHROPIC_API_KEY from secrets (needed for API tests that don't mock)

Create .github/workflows/nightly-regression.yml:
- Trigger: schedule cron '0 6 * * *' + workflow_dispatch
- Jobs: full regression with all browsers, retries=2
- Upload artifacts always (not just on failure)
- Include visual and a11y tests

Create .github/workflows/production-smoke.yml:
- Trigger: workflow_dispatch
- Run tests/e2e/production-smoke.spec.js against BASE_URL=https://astercopilot.com
- Chromium only

Create tests/e2e/production-smoke.spec.js:
- Test: production site loads (status 200)
- Test: app renders without JavaScript errors
- Test: all nav tabs are present
- Test: no console errors on load

After changes: git add -A && git commit -m "add CI/CD workflows for PR checks, nightly regression, and production smoke" && git push
```

---

### Prompt 9: Add visual regression tests

```
Read playwright.config.js. Add visual regression tests.

Create tests/visual/views.spec.js:
- Before each: load onboarded-no-jobs fixture, navigate to target view
- Test: Dashboard view matches screenshot baseline
- Test: Analyze view matches screenshot baseline
- Test: Pipeline view (with 5 jobs) matches screenshot baseline
- Test: Strategy view matches screenshot baseline
- Test: Resume view (no resume) matches screenshot baseline
- Test: Preferences modal matches screenshot baseline

Use Playwright's toHaveScreenshot() with:
- maxDiffPixelRatio: 0.01 (1% threshold)
- mask any dynamic content (timestamps, random IDs)

The first run will create baselines in tests/visual/snapshots/. These should be committed to git.

Mock all /api/claude calls to return consistent responses so screenshots are deterministic.

After changes: git add -A && git commit -m "add visual regression tests with baselines" && git push
```

---

### Prompt 10: Add accessibility checks

```
Read playwright.config.js. Add accessibility testing using @axe-core/playwright.

Create tests/a11y/audit.spec.js:
- Import { AxeBuilder } from '@axe-core/playwright'
- Before each: load onboarded-no-jobs fixture
- Test: Dashboard has no critical or serious accessibility violations
- Test: Analyze view has no critical or serious violations
- Test: Pipeline view has no critical or serious violations
- Test: Preferences modal has no critical or serious violations
- Test: Onboarding welcome screen has no critical or serious violations

For each test:
1. Navigate to the view
2. Run new AxeBuilder({ page }).analyze()
3. Filter results to only critical and serious violations
4. Assert violations array is empty
5. If violations found, log them clearly with: id, impact, description, and affected nodes

After changes: git add -A && git commit -m "add accessibility audit tests" && git push
```
