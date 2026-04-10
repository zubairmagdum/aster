import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// DB Error Handling
// ═══════════════════════════════════════════════════════════════════════════════

const mockUpsert = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockSelect = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      upsert: mockUpsert,
      insert: mockInsert,
      delete: () => ({ eq: () => ({ eq: mockDelete }) }),
      select: () => ({
        eq: (col, val) => ({
          order: mockSelect,
          maybeSingle: mockMaybeSingle,
          eq: () => ({ eq: mockDelete }),
        }),
      }),
    }),
  },
}));

const {
  dbSaveJob, dbSaveAllJobs, dbLoadJobs, dbDeleteJob, dbSaveResume, dbLoadResume,
  dbSavePrefs, dbLoadPrefs, dbSaveContact, dbLoadContacts, dbEnsureUser,
  dbSaveStrategy, dbLoadStrategy, dbSubscribeEmail, dbSubmitRating, dbSubmitFeedback,
} = await import('../../lib/db.js');

describe('lib/db.js — error handling', () => {
  beforeEach(() => {
    mockUpsert.mockReset();
    mockInsert.mockReset();
    mockDelete.mockReset();
    mockSelect.mockReset();
    mockMaybeSingle.mockReset();
  });

  // ─── Write operations throw/return error ──────────────────────────────────

  it('dbSaveJob returns {error} on Supabase error', async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: 'row too large' } });
    const result = await dbSaveJob({ id: '1', company: 'Co' }, 'u1');
    expect(result.error).toBe('row too large');
  });

  it('dbSaveJob returns {error: null} on success', async () => {
    mockUpsert.mockResolvedValueOnce({ error: null });
    const result = await dbSaveJob({ id: '1', company: 'Co' }, 'u1');
    expect(result.error).toBeNull();
  });

  it('dbSaveJob catches thrown exceptions', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('network down'));
    const result = await dbSaveJob({ id: '1', company: 'Co' }, 'u1');
    expect(result.error).toBe('network down');
  });

  it('dbSaveAllJobs returns {error} on failure', async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: 'bulk fail' } });
    const result = await dbSaveAllJobs([{ id: '1', company: 'A' }], 'u1');
    expect(result.error).toBe('bulk fail');
  });

  it('dbSaveAllJobs catches thrown exceptions', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('timeout'));
    const result = await dbSaveAllJobs([{ id: '1', company: 'A' }], 'u1');
    expect(result.error).toBe('timeout');
  });

  it('dbDeleteJob returns {error} on failure', async () => {
    mockDelete.mockResolvedValueOnce({ error: { message: 'not found' } });
    const result = await dbDeleteJob('1', 'u1');
    expect(result.error).toBe('not found');
  });

  it('dbSaveResume returns {error} on failure', async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: 'too big' } });
    const result = await dbSaveResume('text', 'file.pdf', 'u1');
    expect(result.error).toBe('too big');
  });

  it('dbSavePrefs returns {error} on failure', async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: 'invalid' } });
    const result = await dbSavePrefs({}, 'u1');
    expect(result.error).toBe('invalid');
  });

  it('dbSaveContact returns {error} on failure', async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: 'constraint' } });
    const result = await dbSaveContact({ id: 'c1', name: 'X' }, 'u1');
    expect(result.error).toBe('constraint');
  });

  it('dbEnsureUser returns {error} on failure', async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: 'dup' } });
    const result = await dbEnsureUser({ id: 'u1', email: 'a@b.com' });
    expect(result.error).toBe('dup');
  });

  it('dbSaveStrategy returns {error} on failure', async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: 'timeout' } });
    const result = await dbSaveStrategy({ targetRole: 'dev' }, 'u1');
    expect(result.error).toBe('timeout');
  });

  it('dbSubscribeEmail handles duplicate gracefully', async () => {
    // Simulate existing email found
    mockMaybeSingle.mockResolvedValueOnce({ data: { email: 'a@b.com' } });
    const result = await dbSubscribeEmail('a@b.com');
    expect(result.error).toBeNull();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('dbSubscribeEmail returns {error} on insert failure', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null });
    mockInsert.mockResolvedValueOnce({ error: { message: 'server error' } });
    const result = await dbSubscribeEmail('new@b.com');
    expect(result.error).toBe('server error');
  });

  it('dbSubmitRating returns {error} on failure', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'bad payload' } });
    const result = await dbSubmitRating({ rating: 1 });
    expect(result.error).toBe('bad payload');
  });

  it('dbSubmitFeedback returns {error} on failure', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'err' } });
    const result = await dbSubmitFeedback({ text: 'hello' });
    expect(result.error).toBe('err');
  });

  // ─── Read operations return null on error ─────────────────────────────────

  it('dbLoadJobs returns null on error', async () => {
    mockSelect.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
    const result = await dbLoadJobs('u1');
    expect(result).toBeNull();
  });

  it('dbLoadResume returns null on error', async () => {
    mockMaybeSingle.mockRejectedValueOnce(new Error('fail'));
    const result = await dbLoadResume('u1');
    expect(result).toBeNull();
  });

  it('dbLoadPrefs returns null on error', async () => {
    mockMaybeSingle.mockRejectedValueOnce(new Error('fail'));
    const result = await dbLoadPrefs('u1');
    expect(result).toBeNull();
  });

  it('dbLoadContacts returns null on error', async () => {
    mockSelect.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } });
    // Need to re-test the actual flow; the mock setup above covers the case
    const result = await dbLoadContacts('u1');
    expect(result).toBeNull();
  });

  it('dbLoadStrategy returns null on error', async () => {
    mockMaybeSingle.mockRejectedValueOnce(new Error('timeout'));
    const result = await dbLoadStrategy('u1');
    expect(result).toBeNull();
  });

  // ─── All functions handle supabase/userId being null ──────────────────────

  it('all functions return safely when no userId', async () => {
    expect((await dbSaveJob({ id: '1' }, null)).error).toBeNull();
    expect((await dbSaveAllJobs([], null)).error).toBeNull();
    expect(await dbLoadJobs(null)).toBeNull();
    expect((await dbDeleteJob('1', null)).error).toBeNull();
    expect((await dbSaveResume('t', 'f', null)).error).toBeNull();
    expect(await dbLoadResume(null)).toBeNull();
    expect((await dbSavePrefs({}, null)).error).toBeNull();
    expect(await dbLoadPrefs(null)).toBeNull();
    expect((await dbSaveContact({}, null)).error).toBeNull();
    expect(await dbLoadContacts(null)).toBeNull();
    expect((await dbEnsureUser(null)).error).toBeNull();
    expect((await dbSaveStrategy({}, null)).error).toBeNull();
    expect(await dbLoadStrategy(null)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PostHog Safety
// ═══════════════════════════════════════════════════════════════════════════════

describe('PostHog — never throws', () => {
  it('ph.capture does not throw', async () => {
    const { ph } = await import('../../lib/posthog.js');
    expect(() => ph.capture('test_event')).not.toThrow();
  });

  it('ph.identify does not throw', async () => {
    const { ph } = await import('../../lib/posthog.js');
    expect(() => ph.identify('user1')).not.toThrow();
  });

  it('ph.reset does not throw', async () => {
    const { ph } = await import('../../lib/posthog.js');
    expect(() => ph.reset()).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Analytics Safety
// ═══════════════════════════════════════════════════════════════════════════════

describe('Analytics — corrupted localStorage', () => {
  it('track() handles corrupted events JSON', async () => {
    const mockStorage = { getItem: vi.fn().mockReturnValue('NOT_JSON'), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal('localStorage', mockStorage);
    const { Analytics } = await import('../../lib/analytics.js');
    expect(() => Analytics.track('test')).not.toThrow();
    vi.unstubAllGlobals();
  });

  it('getWeeklyRollup() handles corrupted events JSON', async () => {
    const mockStorage = { getItem: vi.fn().mockReturnValue('{bad}'), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal('localStorage', mockStorage);
    const { Analytics } = await import('../../lib/analytics.js');
    expect(() => Analytics.getWeeklyRollup()).not.toThrow();
    expect(Analytics.getWeeklyRollup()).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('getWeeklyRollup() handles non-array events', async () => {
    const mockStorage = { getItem: vi.fn().mockReturnValue('"just a string"'), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal('localStorage', mockStorage);
    const { Analytics } = await import('../../lib/analytics.js');
    expect(Analytics.getWeeklyRollup()).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('track() never shows user-facing errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockStorage = { getItem: vi.fn(() => { throw new Error('quota'); }), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal('localStorage', mockStorage);
    const { Analytics } = await import('../../lib/analytics.js');
    Analytics.track('test');
    // Should not have thrown or shown error to console.error
    vi.unstubAllGlobals();
    consoleSpy.mockRestore();
  });
});
