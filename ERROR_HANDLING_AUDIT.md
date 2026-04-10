# Error Handling & Security Audit

**Date:** 2026-04-08
**Status:** Complete — all findings fixed

---

## Part 1: Security Fixes

| # | File | Issue | Fix |
|---|------|-------|-----|
| S1 | `/api/claude.js` | Open proxy — no rate limiting, empty origin allowed, no body size limit, no max_tokens cap | Rate limit 20/min/IP, require origin, 50KB body limit, cap max_tokens at 4096, 55s timeout |
| S2 | `/api/digest.js` | No auth — anyone could query per-user data | Require `Authorization: Bearer <DIGEST_API_KEY>`, return aggregate stats only (no userId) |
| S3 | `/api/scrape.js` | No rate limiting, no SSRF protection | Rate limit 10/min/IP, block private IPs (10.x, 172.16-31.x, 192.168.x, 127.x, localhost, metadata) |
| S4 | `lib/db.js` | `email_subscribers` allows duplicate inserts | Check existence before insert in `dbSubscribeEmail` |
| S5 | `supabase/migrations/010_security_fixes.sql` | RLS policies too permissive for ratings/feedback, no email unique constraint | UNIQUE on email, fixed RLS policies, performance indexes |

---

## Part 2: Error Handling — Every Async Operation

| Location | Operation | Error Message | Recovery Action | Tested? |
|----------|-----------|---------------|-----------------|---------|
| `callClaude()` | Fetch to /api/claude | "Could not reach Aster. Check your connection." | Retry button (Analyze enables) | Yes |
| `callClaude()` | 429 response | "Too many requests. Wait a moment and try again." | Automatic cooldown | Yes |
| `callClaude()` | Timeout (45s) | "Request timed out after 45 seconds. Try again." | Retry | Yes |
| `callClaude()` | Malformed response | "Could not parse analysis results. Please try again." | Retry | Yes |
| `callClaude()` | No content array | "Unexpected response format. Please try again." | Retry | Yes |
| `parseResume()` | File read error | "Could not read file. Try a different file format." | Try different file | Yes |
| `parseResume()` | Network error | "Could not reach the server. Check your connection." | Retry | Yes |
| `parseResume()` | Parse failure | "Could not extract text from this file. Try PDF or DOCX." | Different format | Yes |
| `analyze()` | Any error | Shows `e.message` from callClaude | Textarea preserved, retry | Yes |
| `analyze()` | >30s wait | "Still working on it..." | Informational only | Yes |
| `save()` | addJob throws | "Couldn't save. Your analysis is still here — try again." | Retry save | Yes |
| `syncAndLoad()` | Sync failure | "Couldn't sync your data. Working offline." | App works offline | Yes |
| `initAuth()` | getUser throws | Console warn, app continues | Graceful degradation | Yes |
| `onResumeUploaded()` | Pref inference fails | Console warn, manual prefs | Works without inferred prefs | Yes |
| `onResumeUploaded()` | Parse fails | "Could not parse file" toast | Try different file | Yes |
| `handleSubscribeEmail()` | Insert fails | Best-effort, silent | Still shows confirmation | Yes |
| `FeedbackWidget.submit()` | Submit fails | "Feedback couldn't be sent. Try again." | Retry | Yes |
| `AnalysisFeedback.submit()` | Rating fails | Fire-and-forget, saved locally | Local backup | Yes |
| `loadActions()` | callClaude fails | "Couldn't load insights" | Retry available | Yes |
| `runInterviewPrep()` | callClaude fails | Shows `e.message` | Retry | Yes |
| `getStrategy()` | callClaude fails | "Strategy failed" | Retry | Yes |
| `generateMsg()` | callClaude fails | "Message generation failed" | Retry | Yes |
| `Strategy brief` | callClaude fails | "Strategy brief failed. Try again." | Retry | Yes |
| `ProofLibrary.extract()` | callClaude fails | "Extraction failed" | Retry | Yes |
| `ProofLibrary` | Supabase upsert | Silent `.catch()` | Fire-and-forget | Yes |
| `dbSaveJob()` | Supabase error | Returns `{ error }` | Caller decides UI | Yes |
| `dbSaveAllJobs()` | Supabase error | Returns `{ error }` | Caller decides UI | Yes |
| `dbDeleteJob()` | Supabase error | Returns `{ error }` | Caller decides UI | Yes |
| `dbSaveResume()` | Supabase error | Returns `{ error }` | Caller decides UI | Yes |
| `dbSavePrefs()` | Supabase error | Returns `{ error }` | Caller decides UI | Yes |
| `dbSaveContact()` | Supabase error | Returns `{ error }` | Caller decides UI | Yes |
| `dbEnsureUser()` | Supabase error | Returns `{ error }` | Caller decides UI | Yes |
| `dbSaveStrategy()` | Supabase error | Returns `{ error }` | Caller decides UI | Yes |
| `dbSubscribeEmail()` | Supabase error | Returns `{ error }` | Caller decides UI | Yes |
| `dbSubmitRating()` | Supabase error | Returns `{ error }` | Caller decides UI | Yes |
| `dbSubmitFeedback()` | Supabase error | Returns `{ error }` | Caller decides UI | Yes |
| `dbLoadJobs()` | Supabase error | Returns null | Falls back to localStorage | Yes |
| `dbLoadResume()` | Supabase error | Returns null | Falls back to localStorage | Yes |
| `dbLoadPrefs()` | Supabase error | Returns null | Falls back to localStorage | Yes |
| `dbLoadContacts()` | Supabase error | Returns null | Falls back to localStorage | Yes |
| `dbLoadStrategy()` | Supabase error | Returns null | Falls back to localStorage | Yes |
| `ph.capture()` | PostHog throws | Silent try/catch | Analytics never breaks app | Yes |
| `ph.identify()` | PostHog throws | Silent try/catch | Analytics never breaks app | Yes |
| `ph.reset()` | PostHog throws | Silent try/catch | Analytics never breaks app | Yes |
| `initPosthog()` | PostHog init fails | Console warn | App works without analytics | Yes |
| `Analytics.track()` | localStorage corrupt | Silent try/catch | Events dropped silently | Yes |
| `Analytics.getWeeklyRollup()` | localStorage corrupt | Returns `[]` | Dashboard shows empty | Yes |
| `Store.get()` | JSON.parse throws | Returns fallback | App uses defaults | Yes |
| `Store.set()` | Quota exceeded | `_storageQuotaError` toast | "Storage full" message | Yes |

---

## Part 3: Structural Safeguards

| Safeguard | File | Description |
|-----------|------|-------------|
| ErrorBoundary | `components/ErrorBoundary.js` + `_app.js` | Catches render crashes, shows "Refresh" recovery UI |
| Unhandled rejection handler | `_app.js` | `window.onunhandledrejection` logs to console |
| Rate limiting (Claude) | `/api/claude.js` | 20 req/min/IP in-memory Map |
| Rate limiting (Scrape) | `/api/scrape.js` | 10 req/min/IP in-memory Map |
| SSRF protection | `/api/scrape.js` | Blocks private IPs, localhost, metadata endpoint |
| Origin validation | `/api/claude.js` | Requires origin header matching allowlist |
| Body size validation | `/api/claude.js` | Rejects bodies > 50KB |
| Auth on digest | `/api/digest.js` | Requires `DIGEST_API_KEY` Bearer token |
| Email dedup | `lib/db.js` | Checks existence before insert |

---

## Test Coverage

| Test File | Tests | Coverage Area |
|-----------|-------|---------------|
| `tests/unit/security.test.js` | 21 | API route security (rate limiting, origin, SSRF, auth) |
| `tests/unit/error-handling.test.js` | 28 | DB error handling, PostHog safety, Analytics safety |
| `tests/unit/scraper-comprehensive.test.js` | 36 | Fixture parsing, SSRF, edge cases, blocked domains |
| `tests/unit/dual-write.test.js` | 15 | localStorage + Supabase dual-write pattern |
| `tests/e2e/full-system.spec.js` | 26 | Full user flows, error resilience, mobile, persistence |
| (Existing unit tests) | 245 | All pre-existing coverage maintained |
| **Total new tests** | **126** | |

---

## Principles Applied

1. Every user-facing error shows a visible toast in plain English
2. Every error offers a next step (retry, try different format, check connection)
3. Textarea content and analysis results are NEVER cleared on error
4. Analytics/tracking never breaks the app — all fire-and-forget
5. Supabase writes return `{ error }` — callers decide UI response
6. ErrorBoundary prevents white screens with crash recovery
7. API routes have rate limiting and input validation
8. SSRF protection blocks requests to internal networks
9. Digest API requires auth, exposes only aggregates
