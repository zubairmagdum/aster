# AsterCopilot fake test datasets

These files are synthetic and intended for QA automation and manual testing.

Contents
- candidate_profiles.valid.json / csv: realistic user profiles
- job_postings.valid.json / csv: realistic job postings
- resume_edge_cases.json + *.txt: upload-focused edge cases
- analysis_api_mocks.json: mocked AI responses (success, partial, malformed, timeout, 500)
- localstorage_states.json: prebuilt browser storage fixtures
- pipeline_applications.json: application pipeline records
- outreach_messages.json: outreach draft/send states

Suggested high-value test buckets
1. Happy path: valid candidate + valid job + success_strong_fit
2. Seniority mismatch: cand_002 + job_003 + success_low_fit
3. Corrupt state recovery: corrupt_json_profile
4. Resume upload hardening: every resume_*.txt file
5. API resilience: partial_json, malformed_json_string, api_500_error, api_timeout, empty_response
