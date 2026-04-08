# AsterCopilot Database Testing Plan

## 1. Database Discovery

### Technology Stack
- **Database:** Supabase (PostgreSQL)
- **Query layer:** Supabase JS client (`@supabase/supabase-js`) — no ORM
- **Auth:** Supabase Auth with magic link OTP
- **Security:** Row-Level Security (RLS) policies on all tables
- **Client:** `lib/supabase.js` (client init + auth helpers)
- **Data layer:** `lib/db.js` (9 CRUD functions with localStorage fallback)
- **Schema:** `supabase/migrations/001_initial_schema.sql`

### Tables (5)
| Table | Columns | PK | FK | Constraints |
|---|---|---|---|---|
| `users` | id, email, created_at | id (UUID) | auth.users(id) | — |
| `resumes` | id, user_id, file_name, resume_text, created_at, updated_at | id (UUID) | users(id) CASCADE | — |
| `preferences` | id, user_id, prefs, updated_at | id (UUID) | users(id) CASCADE | user_id UNIQUE |
| `jobs` | id, user_id, company, role, status, date_added, jd_text, analysis, notes, fit_score, match_score, role_dna, interview_prep, updated_at | id (UUID) | users(id) CASCADE | — |
| `contacts` | id, user_id, job_id, name, title, company, linkedin_url, status, messages, updated_at | id (UUID) | users(id) CASCADE, jobs(id) CASCADE | — |

### Data Flow
```
User Action → React setState → localStorage (Store.set) → if(user) → Supabase (dbSave*)
Page Load → localStorage (Store.get) → if(user) → Supabase (dbLoad*) overrides state
Sign In → localStorage → Supabase sync (dbSaveAll*)
```

### DB Access Points in pages/index.js
- `dbEnsureUser` — lines 259, 274 (auth state change)
- `dbLoadJobs` — line 261 (init)
- `dbLoadResume` — line 263 (init)
- `dbLoadPrefs` — line 265 (init)
- `dbSaveAllJobs` — line 277 (sync on sign-in)
- `dbSaveResume` — lines 280, 294 (sync + upload)
- `dbSavePrefs` — lines 282, 350 (sync + manual save)
- `dbSaveJob` — lines 327, 335 (add + update)
- `dbDeleteJob` — line 342 (remove)

### NOT persisted to Supabase
- `contacts` — localStorage only (db table exists but no db.js functions use it)
- `profile` — localStorage only
- `aster_events` — localStorage only (analytics)
- `aster_target_role`, `aster_whats_working`, `aster_whats_not_working` — localStorage only
- `aster_strategy_brief`, `aster_resume_versions` — localStorage only
- `aster_onboarded` — localStorage only

---

## 2. Data Model Risk Analysis

### users
| Risk | Severity | Description |
|---|---|---|
| Orphaned auth user | Medium | Supabase auth user exists but no `users` row — `dbEnsureUser` mitigates via upsert |
| Email mismatch | Low | Email in users table could differ from auth email if changed |
| Missing user record | High | If `dbEnsureUser` fails silently, all subsequent writes fail due to FK constraints |

### resumes
| Risk | Severity | Description |
|---|---|---|
| Multiple resumes per user | Medium | Schema allows multiple rows (no UNIQUE on user_id), but `dbSaveResume` uses upsert with `onConflict: 'user_id'` — **this will fail** because there's no UNIQUE constraint on user_id in the resumes table |
| Huge resume text | Medium | TEXT column with no size limit — could store 4000+ char documents |
| Resume loss on sync | High | If Supabase load returns empty but localStorage has data, the Supabase empty wins |

### preferences
| Risk | Severity | Description |
|---|---|---|
| JSONB schema drift | Medium | Prefs object can contain any keys — no validation |
| Merge conflicts | High | `dbLoadPrefs` returns prefs, merged with `DEFAULT_PREFS` and current state — order matters |
| Stale prefs overwrite | High | On sign-in, localStorage prefs sync to DB, potentially overwriting newer DB prefs |

### jobs
| Risk | Severity | Description |
|---|---|---|
| ID format mismatch | **Critical** | Client generates IDs as `Date.now().toString()` (string number) but DB column is UUID — **`Date.now().toString()` is NOT a valid UUID** |
| Duplicate jobs on sync | High | `dbSaveAllJobs` upserts all localStorage jobs on every sign-in — could create duplicates if IDs don't match |
| Status enum not enforced | Medium | `status` is TEXT with no CHECK constraint — any string accepted |
| Partial analysis data | Low | `analysis` JSONB can be null or partial — UI must handle |
| Import jobs bypass DB | **Critical** | CSV/bulk import writes to localStorage + `setJobs` but does NOT call `dbSaveJob` — imported jobs are never saved to Supabase |

### contacts
| Risk | Severity | Description |
|---|---|---|
| No DB persistence | **Critical** | `contacts` table exists in schema but `lib/db.js` has zero contact functions — contacts are localStorage-only |
| Orphaned contacts | Medium | If job is deleted via Supabase CASCADE, localStorage contacts still reference deleted job_id |
| Cross-reference broken | Medium | Contact `job_id` references a job that may have different IDs in localStorage vs Supabase |

---

## 3. Exhaustive Database Test Cases

### A. users table

| ID | Test | Type | Priority | Layer |
|---|---|---|---|---|
| U-01 | dbEnsureUser creates user record | Positive | P0 | Integration |
| U-02 | dbEnsureUser is idempotent — calling twice doesn't error | Positive | P0 | Integration |
| U-03 | dbEnsureUser with null user — no crash | Negative | P1 | Unit |
| U-04 | User record has correct email | Positive | P1 | Integration |
| U-05 | RLS: user can only read own record | Security | P0 | Integration |
| U-06 | Deleting auth user cascades to all tables | Integrity | P0 | Integration |

### B. resumes table

| ID | Test | Type | Priority | Layer |
|---|---|---|---|---|
| R-01 | dbSaveResume creates resume record | Positive | P0 | Integration |
| R-02 | dbSaveResume updates existing resume (upsert) | Positive | P0 | Integration |
| R-03 | dbLoadResume returns saved resume | Positive | P0 | Integration |
| R-04 | dbLoadResume returns null when no resume | Edge | P1 | Integration |
| R-05 | dbSaveResume with empty string resume_text | Edge | P1 | Integration |
| R-06 | dbSaveResume with 4000+ char resume | Edge | P1 | Integration |
| R-07 | dbSaveResume with unicode characters | Edge | P2 | Integration |
| R-08 | dbSaveResume without userId — no crash | Negative | P1 | Unit |
| R-09 | Resume upsert conflict on user_id — **will fail without UNIQUE constraint** | Bug | P0 | Integration |
| R-10 | RLS: user cannot read another user's resume | Security | P0 | Integration |
| R-11 | localStorage fallback works when Supabase is null | Fallback | P0 | Unit |

### C. preferences table

| ID | Test | Type | Priority | Layer |
|---|---|---|---|---|
| P-01 | dbSavePrefs creates prefs record | Positive | P0 | Integration |
| P-02 | dbSavePrefs updates existing prefs (upsert) | Positive | P0 | Integration |
| P-03 | dbLoadPrefs returns saved prefs | Positive | P0 | Integration |
| P-04 | dbLoadPrefs returns null when no prefs | Edge | P1 | Integration |
| P-05 | Prefs JSONB stores complex nested object | Positive | P1 | Integration |
| P-06 | Prefs merge order: DEFAULT_PREFS < localStorage < Supabase | Logic | P0 | Unit |
| P-07 | dbSavePrefs without userId — no crash | Negative | P1 | Unit |
| P-08 | RLS: user cannot read another user's prefs | Security | P0 | Integration |
| P-09 | UNIQUE constraint on user_id enforced | Integrity | P1 | Integration |

### D. jobs table

| ID | Test | Type | Priority | Layer |
|---|---|---|---|---|
| J-01 | dbSaveJob creates job record | Positive | P0 | Integration |
| J-02 | dbSaveJob updates existing job (upsert) | Positive | P0 | Integration |
| J-03 | dbLoadJobs returns all user's jobs | Positive | P0 | Integration |
| J-04 | dbLoadJobs returns jobs ordered by date DESC | Positive | P1 | Integration |
| J-05 | dbDeleteJob removes job | Positive | P0 | Integration |
| J-06 | dbDeleteJob with wrong userId — no delete | Security | P0 | Integration |
| J-07 | **Job ID is Date.now() string, not UUID — upsert will fail** | Bug | P0 | Integration |
| J-08 | dbSaveAllJobs batch upserts multiple jobs | Positive | P0 | Integration |
| J-09 | dbSaveAllJobs with empty array — no crash | Edge | P1 | Unit |
| J-10 | Job with null analysis JSONB | Edge | P1 | Integration |
| J-11 | Job with very large analysis JSONB (50KB+) | Edge | P2 | Integration |
| J-12 | RLS: user cannot read another user's jobs | Security | P0 | Integration |
| J-13 | Job status can be any string (no CHECK) | Edge | P2 | Integration |
| J-14 | **Import jobs bypass Supabase** — imported jobs not saved to DB | Bug | P0 | E2E |
| J-15 | Concurrent addJob calls — no duplicate IDs | Concurrency | P1 | Integration |
| J-16 | Job field mapping: client dateAdded ↔ DB date_added | Mapping | P0 | Unit |
| J-17 | Job field mapping: client aiAnalysis ↔ DB analysis | Mapping | P0 | Unit |

### E. contacts table

| ID | Test | Type | Priority | Layer |
|---|---|---|---|---|
| C-01 | **No DB functions exist for contacts** — table is unused | Bug | P1 | Audit |
| C-02 | Contact deletion cascades when job is deleted | Integrity | P1 | Integration |
| C-03 | Contact references valid job_id | Integrity | P1 | Integration |

### F. Auth flow

| ID | Test | Type | Priority | Layer |
|---|---|---|---|---|
| A-01 | signInWithMagicLink sends OTP | Positive | P0 | Integration |
| A-02 | signInWithMagicLink with invalid email | Negative | P1 | Unit |
| A-03 | signOut clears session | Positive | P0 | Integration |
| A-04 | onAuthStateChange fires on sign-in | Positive | P0 | Integration |
| A-05 | Data syncs to Supabase on first sign-in | Positive | P0 | E2E |
| A-06 | Supabase null (env vars missing) — all auth functions return gracefully | Fallback | P0 | Unit |

### G. Sync & Consistency

| ID | Test | Type | Priority | Layer |
|---|---|---|---|---|
| S-01 | Sign-in syncs localStorage jobs to Supabase | Positive | P0 | E2E |
| S-02 | After sign-in, Supabase data overrides localStorage | Positive | P0 | E2E |
| S-03 | **Stale localStorage overwrites newer Supabase data on sign-in** | Bug | P0 | E2E |
| S-04 | Refresh page after sign-in — data still from Supabase | Persistence | P0 | E2E |
| S-05 | Sign out — localStorage data remains, Supabase access revoked | Positive | P1 | E2E |
| S-06 | Two tabs open — concurrent writes to same user | Concurrency | P1 | E2E |
| S-07 | Offline mode — localStorage works, Supabase calls fail silently | Fallback | P0 | E2E |

---

## 4. Critical Bugs Found During Analysis

### BUG 1: Job ID Format Incompatible with UUID Column
**Severity:** P0 — will crash on every Supabase write

`addJob` generates IDs as `Date.now().toString()` (e.g., `"1712345678901"`). The `jobs.id` column is `UUID PRIMARY KEY DEFAULT gen_random_uuid()`. Inserting a non-UUID string into a UUID column will throw a PostgreSQL error.

**Fix:** Either change the schema to `TEXT PRIMARY KEY` or generate UUIDs in `addJob`.

### BUG 2: Resume Upsert Will Fail — No UNIQUE Constraint on user_id
**Severity:** P0 — `dbSaveResume` uses `onConflict: 'user_id'` but the `resumes` table has no UNIQUE constraint on `user_id` (unlike `preferences` which does).

**Fix:** Add `UNIQUE` to `resumes.user_id` in the schema, or change the upsert strategy.

### BUG 3: Import Jobs Never Saved to Supabase
**Severity:** P1 — CSV/manual/bulk import writes to localStorage and `setJobs` but never calls `dbSaveJob` or `dbSaveAllJobs`. Imported jobs exist in localStorage only until next sign-in sync.

### BUG 4: Contacts Table Unused
**Severity:** P1 — Schema has `contacts` table but `lib/db.js` has no contact functions. All contact data is localStorage-only.

### BUG 5: Sign-in Sync Overwrites DB with Stale localStorage
**Severity:** P1 — On `onAuthStateChange`, the code unconditionally syncs localStorage to Supabase (`dbSaveAllJobs`, `dbSaveResume`, `dbSavePrefs`). If the user has newer data in Supabase (edited on another device), it gets overwritten.

---

## 5. State Consistency Testing Strategy

### Test: localStorage ↔ Supabase consistency
1. Save job via UI → verify both localStorage AND Supabase have the job
2. Update job status → verify both stores updated
3. Delete job → verify removed from both
4. Save prefs → verify both stores match
5. Upload resume → verify both stores have the text

### Test: Refresh persistence
1. Add job while signed in → refresh → job still visible (from Supabase)
2. Add job while signed out → refresh → job still visible (from localStorage)
3. Sign in → add job → sign out → refresh → job still visible (from localStorage)

### Test: Cross-device sync
1. Sign in on device A → add job → sign in on device B → job appears
2. This relies on Supabase being the source of truth for signed-in users

### Test: Conflict resolution
1. Add job while offline → sign in → job syncs to Supabase
2. Modify job on device A → modify same job on device B → last write wins (no conflict resolution)

---

## 6. Migration Testing

### Current migration: 001_initial_schema.sql
- Creates 5 tables with FK relationships
- Enables RLS on all tables
- Creates 5 RLS policies

### Test cases:
| ID | Test | Priority |
|---|---|---|
| M-01 | Migration creates all 5 tables | P0 |
| M-02 | FK constraints work (insert job without user → fails) | P0 |
| M-03 | CASCADE delete works (delete user → all related data gone) | P0 |
| M-04 | RLS policies block cross-user access | P0 |
| M-05 | UNIQUE constraint on preferences.user_id works | P1 |
| M-06 | **Missing UNIQUE on resumes.user_id breaks upsert** | P0 (bug) |
| M-07 | JSONB columns accept valid JSON | P1 |
| M-08 | TIMESTAMPTZ defaults work | P2 |

### Required schema fix migration (002):
```sql
ALTER TABLE resumes ADD CONSTRAINT resumes_user_id_unique UNIQUE (user_id);
ALTER TABLE jobs ALTER COLUMN id TYPE TEXT;
```

---

## 7. Test Environment Design

### Strategy: Use Supabase test project
- Create a separate Supabase project for testing (or use local Supabase CLI)
- Set test env vars: `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_KEY`
- Use the service role key to bypass RLS for test setup/teardown

### Seeding
- Create test user via Supabase admin API
- Seed with known jobs, resume, prefs fixtures
- Use deterministic UUIDs for test data

### Teardown
- After each test: delete all data for test user
- Use service role to bypass RLS for cleanup

### Isolation
- Each test suite creates its own user with unique email
- Tests are isolated by user_id — no cross-contamination

---

## 8. Implementation Priority

### Phase 1: Fix critical bugs (before any DB tests)
1. Fix job ID format (Date.now → UUID)
2. Add UNIQUE constraint to resumes.user_id
3. Wire import jobs to dbSaveAllJobs

### Phase 2: Unit tests for lib/db.js
1. Test each function with mocked Supabase client
2. Test localStorage fallback when supabase is null
3. Test field mapping (client ↔ DB column names)

### Phase 3: Integration tests
1. Test against real Supabase test project
2. CRUD operations for each table
3. RLS policy verification
4. CASCADE delete verification

### Phase 4: E2E tests
1. Sign in → data syncs
2. Add job → persists in DB
3. Refresh → data from DB
4. Sign out → localStorage still works

---

## 9. Claude Code Build Prompts

### Prompt 1: Fix critical database bugs

```
Read lib/db.js, pages/index.js, and supabase/migrations/001_initial_schema.sql.

Fix these 3 critical bugs:

1. Job ID format: addJob() in pages/index.js generates IDs as Date.now().toString() but the jobs table has UUID PRIMARY KEY. Change the jobs table ID column from UUID to TEXT in the migration. Create supabase/migrations/002_fix_job_id_type.sql:
ALTER TABLE jobs ALTER COLUMN id TYPE TEXT;
ALTER TABLE contacts ALTER COLUMN job_id TYPE TEXT;

2. Resume upsert: dbSaveResume uses onConflict:'user_id' but resumes table lacks UNIQUE on user_id. Add to 002 migration:
ALTER TABLE resumes ADD CONSTRAINT resumes_user_id_unique UNIQUE (user_id);

3. Import jobs bypass DB: In pages/index.js ImportHistoryModal, after setJobs(prev=>[...newJobs,...prev]), add:
if(user) dbSaveAllJobs(newJobs, user.id);

Pass user and dbSaveAllJobs as props to ImportHistoryModal from the main Aster component.

After: npm run build && git add -A && git commit -m "fix: critical DB bugs — job ID type, resume upsert, import sync" && git push
```

### Prompt 2: Unit tests for lib/db.js

```
Read lib/db.js carefully. Write unit tests that mock the Supabase client.

Create tests/unit/db.test.js:
- Mock supabase with vi.mock — mock .from().upsert(), .from().select(), .from().delete()
- Test each function:
  - dbSaveJob: calls upsert with correct field mapping
  - dbSaveAllJobs: batch upserts with correct mapping
  - dbLoadJobs: returns mapped jobs from select result
  - dbLoadJobs: returns null when no data
  - dbDeleteJob: calls delete with correct filters
  - dbSaveResume: calls upsert with onConflict
  - dbLoadResume: returns { text, name } object
  - dbSavePrefs: calls upsert with onConflict
  - dbLoadPrefs: returns prefs object
  - dbEnsureUser: calls upsert with user id and email
  - All functions: return gracefully when supabase is null
  - All functions: log error on Supabase failure but don't throw

After: npm run test && git add -A && git commit -m "qa: unit tests for database layer" && git push
```

### Prompt 3: Auth flow unit tests

```
Read lib/supabase.js and components/AuthModal.js.

Create tests/unit/supabase-auth.test.js:
- Mock createClient
- Test getUser: returns user when session exists
- Test getUser: returns null when no session
- Test getUser: returns null when supabase is null
- Test signInWithMagicLink: calls signInWithOtp with email
- Test signInWithMagicLink: returns error when supabase is null
- Test signOut: calls auth.signOut
- Test signOut: no crash when supabase is null

After: npm run test && git add -A && git commit -m "qa: auth flow unit tests" && git push
```

---

## 10. CI/CD Integration

### PR Checks
- Unit tests for lib/db.js (mocked Supabase) — fast, no DB needed
- Unit tests for lib/supabase.js (mocked) — fast
- Build check

### Nightly
- Integration tests against Supabase test project
- Sync flow E2E tests
- RLS policy verification

### Pre-release
- Full CRUD integration tests
- Migration verification against fresh DB
- Data consistency checks

---

## TOP 15 WAYS THIS DATABASE IMPLEMENTATION COULD FAIL IN PRODUCTION

1. **Job IDs are `Date.now().toString()`, not UUIDs — every `dbSaveJob` call will throw a Postgres type error** on the UUID column. No jobs will persist to Supabase.

2. **`dbSaveResume` upsert uses `onConflict: 'user_id'` but resumes table has no UNIQUE constraint on user_id** — the upsert will fail, creating duplicate resume rows or erroring.

3. **Sign-in sync blindly overwrites Supabase with localStorage** — if a user signs in on a new device, their empty localStorage overwrites their real data in Supabase.

4. **Imported jobs (CSV/manual/bulk) never sync to Supabase** — the ImportHistoryModal writes to localStorage and `setJobs` but never calls any `db*` function. Imported jobs are invisible to Supabase.

5. **Contacts are not persisted to Supabase** — the `contacts` table exists but `lib/db.js` has no contact CRUD functions. All contact data lives only in localStorage and will be lost on browser clear.

6. **No `updated_at` auto-update trigger** — the schema sets `updated_at DEFAULT NOW()` on create but never updates it on modifications. Supabase doesn't auto-update timestamps; you need a trigger.

7. **No conflict resolution for concurrent edits** — two tabs editing the same job will overwrite each other. Last write wins with no version check or optimistic locking.

8. **`dbSaveJob` errors are logged but silently swallowed** — if Supabase write fails, the user sees a success toast (from localStorage) but their data isn't actually persisted to the server.

9. **Strategy, resume versions, and analytics are localStorage-only** — these features have no Supabase persistence. Users lose this data when they clear their browser or switch devices.

10. **RLS policies use `FOR ALL`** — this grants SELECT, INSERT, UPDATE, and DELETE to the row owner. There's no distinction between read and write policies. A compromised client could delete all their own data.

11. **No rate limiting on Supabase calls** — `dbSaveJob` is called on every status dropdown change. Rapid clicking could flood the Supabase API.

12. **`dbLoadJobs` date parsing** — `row.date_added?.split('T')[0]` strips the time component. If two jobs are added on the same day, their sort order becomes non-deterministic.

13. **Auth state race condition** — `onAuthStateChange` fires and syncs localStorage to Supabase, but `initAuth` also runs on mount. If both fire near-simultaneously, double-sync could occur.

14. **No data migration path for existing users** — users who have been using localStorage for weeks have data in a format that may not match the Supabase schema (e.g., job IDs are timestamps, not UUIDs). There's no migration to reconcile this.

15. **Supabase anon key is exposed in client-side JavaScript** — this is by design (Supabase anon key is safe with RLS), but if RLS policies have bugs, any user could read/modify other users' data by crafting direct API calls.
