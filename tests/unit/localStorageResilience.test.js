import fs from 'fs';
import path from 'path';

const states = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'datasets', 'localstorage_states.json'), 'utf-8'));

// Simulates Store.get behavior from the app
function storeGet(storage, key, fallback = null) {
  try {
    const v = storage[key];
    if (v === undefined || v === null) return fallback;
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

describe('localStorage state resilience', () => {
  it('empty_state — all reads return fallbacks', () => {
    const s = states.empty_state;
    expect(storeGet(s, 'aster_onboarded', false)).toBe(false);
    expect(storeGet(s, 'aster_jobs', [])).toEqual([]);
    expect(storeGet(s, 'aster_resume', '')).toBe('');
  });

  it('fresh_onboarding — onboarding not complete', () => {
    const s = states.fresh_onboarding;
    expect(storeGet(s, 'aster:onboardingComplete', false)).toBe(false);
    expect(storeGet(s, 'aster:jobs', [])).toEqual([]);
  });

  it('completed_onboarding_no_jobs — profile parses cleanly', () => {
    const s = states.completed_onboarding_no_jobs;
    expect(storeGet(s, 'aster:onboardingComplete', false)).toBe(true);
    const profile = storeGet(s, 'aster:userProfile', null);
    expect(profile).toBeTruthy();
    expect(typeof profile).toBe('object');
    expect(profile.fullName).toBe('Amina Rahman');
  });

  it('completed_onboarding_with_jobs — jobs array parses', () => {
    const s = states.completed_onboarding_with_jobs;
    const jobs = storeGet(s, 'aster:jobs', []);
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.length).toBe(3);
  });

  it('corrupt_json_profile — storeGet returns fallback, does not crash', () => {
    const s = states.corrupt_json_profile;
    // The profile value is truncated JSON: {"fullName":"Broken User",
    const profile = storeGet(s, 'aster:userProfile', null);
    // JSON.parse should fail, so fallback to null
    expect(profile).toBeNull();
  });

  it('wrong_type_jobs — jobs is object not array, storeGet returns it', () => {
    const s = states.wrong_type_jobs;
    const jobs = storeGet(s, 'aster:jobs', []);
    // JSON.parse succeeds but returns an object, not array
    expect(Array.isArray(jobs)).toBe(false);
    expect(typeof jobs).toBe('object');
    // App code should check Array.isArray before using
  });
});
